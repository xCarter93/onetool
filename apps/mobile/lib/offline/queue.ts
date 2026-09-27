import type { ClassifiedError } from "./errors";

export type OpStatus = "pending" | "syncing" | "synced" | "failed" | "conflict" | "auth_paused";

export type OutboxOp = {
	id: number;
	partition: string;
	chainKey: string;
	operation: string;
	args: unknown;
	idempotencyKey: string;
	capturedAt: number;
	status: OpStatus;
	attempts: number;
	nextAttemptAt: number;
	fileBytes: number;
	replayConfirmed: boolean;
	lastError?: ClassifiedError;
	result?: unknown;
	resolvedAt?: number;
	syncedAt?: number;
};

export type QueueLimits = { maxOps: number; maxFileBytes: number; maxReplayAgeMs: number };

export const DEFAULT_LIMITS: QueueLimits = {
	maxOps: 500,
	maxFileBytes: 200 * 1024 * 1024,
	maxReplayAgeMs: 7 * 24 * 60 * 60 * 1000,
};

export type Outcome = { ok: true; result: unknown } | { ok: false; error: ClassifiedError };

export function isOpen(op: OutboxOp): boolean {
	return op.status !== "synced" && op.resolvedAt === undefined;
}

// Chain head = lowest-id open op per chainKey; later ops in a chain never run
// ahead of it, and any auth_paused op freezes the whole partition.
export function selectRunnable(
	ops: OutboxOp[],
	partition: string,
	now: number,
	limits: QueueLimits
): OutboxOp[] {
	const partitionOps = ops.filter((o) => o.partition === partition);
	if (partitionOps.some((o) => o.status === "auth_paused")) return [];

	const chains = new Map<string, OutboxOp[]>();
	for (const op of partitionOps) {
		if (!isOpen(op)) continue;
		const chain = chains.get(op.chainKey);
		if (chain) chain.push(op);
		else chains.set(op.chainKey, [op]);
	}

	const heads: OutboxOp[] = [];
	for (const chain of chains.values()) {
		chain.sort((a, b) => a.id - b.id);
		const head = chain[0];
		if (
			head.status === "pending" &&
			head.nextAttemptAt <= now &&
			!needsReplayConfirmation(head, now, limits)
		) {
			heads.push(head);
		}
	}
	return heads.sort((a, b) => a.id - b.id);
}

export function applyOutcome(op: OutboxOp, outcome: Outcome, now: number): OutboxOp {
	if (outcome.ok) {
		return { ...op, status: "synced", result: outcome.result, lastError: undefined, syncedAt: now };
	}
	const { error } = outcome;
	if (error.class === "already_applied") {
		return { ...op, status: "synced", lastError: undefined, syncedAt: now };
	}
	if (error.class === "temporary") {
		const attempts = op.attempts + 1;
		return { ...op, status: "pending", attempts, nextAttemptAt: now + backoffMs(attempts), lastError: error };
	}
	if (error.class === "auth") {
		return { ...op, status: "auth_paused", lastError: error };
	}
	if (error.class === "conflict") {
		return { ...op, status: "conflict", lastError: error };
	}
	return { ...op, status: "failed", lastError: error };
}

export function backoffMs(attempts: number): number {
	const n = Math.max(1, attempts);
	return Math.min(2000 * 2 ** (n - 1), 5 * 60 * 1000);
}

export function canEnqueue(
	ops: OutboxOp[],
	partition: string,
	fileBytes: number,
	limits: QueueLimits
): { ok: true } | { ok: false; reason: "too_many_ops" | "too_many_bytes" } {
	const open = ops.filter((o) => o.partition === partition && isOpen(o));
	if (open.length + 1 > limits.maxOps) return { ok: false, reason: "too_many_ops" };
	const bytes = open.reduce((sum, o) => sum + o.fileBytes, 0) + fileBytes;
	if (bytes > limits.maxFileBytes) return { ok: false, reason: "too_many_bytes" };
	return { ok: true };
}

export function needsReplayConfirmation(op: OutboxOp, now: number, limits: QueueLimits): boolean {
	return (
		isOpen(op) &&
		op.status === "pending" &&
		now - op.capturedAt > limits.maxReplayAgeMs &&
		!op.replayConfirmed
	);
}

// Storage marks in-flight ops "syncing" then crashes before the response —
// on restart there's no way to know if the server saw it, so retry as pending.
export function recoverAfterRestart(ops: OutboxOp[]): OutboxOp[] {
	return ops.map((op) => (op.status === "syncing" ? { ...op, status: "pending" } : op));
}

export function resumeAuthPaused(ops: OutboxOp[], partition: string): OutboxOp[] {
	return ops.map((op) =>
		op.partition === partition && op.status === "auth_paused"
			? { ...op, status: "pending", nextAttemptAt: 0 }
			: op
	);
}

export type QueueSummary = {
	pending: number;
	syncing: number;
	failed: number;
	conflict: number;
	authPaused: boolean;
	needsConfirmation: number;
	lastSyncedAt?: number;
};

export function summarize(
	ops: OutboxOp[],
	partition: string,
	now: number,
	limits: QueueLimits
): QueueSummary {
	const partitionOps = ops.filter((o) => o.partition === partition);
	let pending = 0;
	let syncing = 0;
	let failed = 0;
	let conflict = 0;
	let needsConfirmation = 0;
	let authPaused = false;
	let lastSyncedAt: number | undefined;

	for (const op of partitionOps) {
		if (!isOpen(op)) {
			if (op.status === "synced" && op.syncedAt !== undefined) {
				lastSyncedAt = lastSyncedAt === undefined ? op.syncedAt : Math.max(lastSyncedAt, op.syncedAt);
			}
			continue;
		}
		switch (op.status) {
			case "pending":
				pending++;
				if (needsReplayConfirmation(op, now, limits)) needsConfirmation++;
				break;
			case "syncing":
				syncing++;
				break;
			case "failed":
				failed++;
				break;
			case "conflict":
				conflict++;
				break;
			case "auth_paused":
				authPaused = true;
				break;
		}
	}

	return { pending, syncing, failed, conflict, authPaused, needsConfirmation, lastSyncedAt };
}
