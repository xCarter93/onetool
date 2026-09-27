import { ConvexError } from "convex/values";
import type { UserMutationCtx } from "./factories";

const MAX_KEY_LENGTH = 128;

/** Recursively sorts object keys and drops `undefined` so hashing/comparison is order-independent. */
function canonicalize(value: unknown): unknown {
	if (value === undefined) return null;
	if (Array.isArray(value)) return value.map(canonicalize);
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.filter(([, entryValue]) => entryValue !== undefined)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([key, entryValue]) => [key, canonicalize(entryValue)])
		);
	}
	return value;
}

function canonicalJson(value: unknown): string {
	return JSON.stringify(canonicalize(value));
}

/** Deterministic, synchronous 32-bit FNV-1a — good enough for a replay-detection hash, not for security. */
function fnv1a(input: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Excludes idempotencyKey itself so re-sending the same call twice hashes identically. */
export function hashMutationArgs(args: Record<string, unknown>): string {
	const { idempotencyKey, ...rest } = args;
	return fnv1a(canonicalJson(rest));
}

/** Idempotency-key replay guard (PRD-mobile-offline §4.6) — call before any business-state check. */
export async function withReceipt<T>(
	ctx: UserMutationCtx,
	idempotencyKey: string | undefined,
	operation: string,
	args: Record<string, unknown>,
	run: () => Promise<T>
): Promise<T> {
	if (idempotencyKey === undefined) return run();
	if (idempotencyKey.length < 1 || idempotencyKey.length > MAX_KEY_LENGTH) {
		throw new ConvexError({
			code: "BAD_REQUEST",
			message: `idempotencyKey must be 1-${MAX_KEY_LENGTH} characters`,
		});
	}

	const argsHash = hashMutationArgs(args);
	const existing = await ctx.db
		.query("mutationReceipts")
		.withIndex("by_org_user_key", (q) =>
			q.eq("orgId", ctx.orgId).eq("userId", ctx.user._id).eq("key", idempotencyKey)
		)
		.unique();

	if (existing) {
		if (existing.argsHash !== argsHash) {
			throw new ConvexError({
				code: "IDEMPOTENCY_KEY_REUSED",
				message: "This idempotency key was already used with different arguments.",
			});
		}
		return existing.result as T;
	}

	const result = await run();
	await ctx.db.insert("mutationReceipts", {
		orgId: ctx.orgId,
		userId: ctx.user._id,
		key: idempotencyKey,
		operation,
		argsHash,
		result: result === undefined ? undefined : result,
		createdAt: Date.now(),
	});
	return result;
}

/** Field-patch base-value check (PRD-mobile-offline §3.5) — CONFLICT/FIELD_CHANGED on any mismatch. */
export function assertExpectedValues(
	current: Record<string, unknown>,
	expected: Record<string, unknown> | undefined
): void {
	if (!expected) return;
	const mismatched = Object.keys(expected).filter((key) => {
		const currentValue = current[key] ?? null;
		const expectedValue = expected[key] ?? null;
		return canonicalJson(currentValue) !== canonicalJson(expectedValue);
	});
	if (mismatched.length > 0) {
		throw new ConvexError({
			code: "CONFLICT",
			reason: "FIELD_CHANGED",
			fields: mismatched,
			message: "This record changed on another device.",
		});
	}
}
