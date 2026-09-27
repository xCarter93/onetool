import { describe, expect, it } from "vitest";
import type { ClassifiedError } from "./errors";
import {
	applyOutcome,
	backoffMs,
	canEnqueue,
	DEFAULT_LIMITS,
	needsReplayConfirmation,
	recoverAfterRestart,
	resumeAuthPaused,
	selectRunnable,
	summarize,
	type OutboxOp,
	type QueueLimits,
} from "./queue";

const LIMITS: QueueLimits = DEFAULT_LIMITS;

let nextId = 1;
function op(overrides: Partial<OutboxOp> = {}): OutboxOp {
	return {
		id: nextId++,
		partition: "p1",
		chainKey: "task:1",
		operation: "tasks.complete",
		args: {},
		idempotencyKey: `key${nextId}`,
		capturedAt: 0,
		status: "pending",
		attempts: 0,
		nextAttemptAt: 0,
		fileBytes: 0,
		replayConfirmed: false,
		...overrides,
	};
}

function err(cls: ClassifiedError["class"]): ClassifiedError {
	return { class: cls, message: "x" };
}

describe("selectRunnable", () => {
	it("runs a chain's head in FIFO order and never lets a later op jump ahead", () => {
		const a = op({ chainKey: "task:1" });
		const b = op({ chainKey: "task:1" });
		const runnable = selectRunnable([a, b], "p1", 100, LIMITS);
		expect(runnable.map((o) => o.id)).toEqual([a.id]);
	});

	it("runs independent chains in parallel", () => {
		const a = op({ chainKey: "task:1" });
		const b = op({ chainKey: "task:2" });
		const runnable = selectRunnable([a, b], "p1", 100, LIMITS);
		expect(runnable.map((o) => o.id).sort()).toEqual([a.id, b.id].sort());
	});

	it("blocks only the chain whose head is failed or conflict", () => {
		const blockedHead = op({ chainKey: "task:1", status: "failed" });
		const blockedTail = op({ chainKey: "task:1" });
		const freeHead = op({ chainKey: "task:2" });
		const runnable = selectRunnable([blockedHead, blockedTail, freeHead], "p1", 100, LIMITS);
		expect(runnable.map((o) => o.id)).toEqual([freeHead.id]);
	});

	it("blocks a chain whose head is syncing", () => {
		const head = op({ chainKey: "task:1", status: "syncing" });
		const tail = op({ chainKey: "task:1" });
		const runnable = selectRunnable([head, tail], "p1", 100, LIMITS);
		expect(runnable).toEqual([]);
	});

	it("pauses the entire partition when any op is auth_paused", () => {
		const paused = op({ chainKey: "task:1", status: "auth_paused" });
		const otherwiseRunnable = op({ chainKey: "task:2" });
		const runnable = selectRunnable([paused, otherwiseRunnable], "p1", 100, LIMITS);
		expect(runnable).toEqual([]);
	});

	it("respects nextAttemptAt backoff", () => {
		const notYet = op({ chainKey: "task:1", nextAttemptAt: 1000 });
		expect(selectRunnable([notYet], "p1", 500, LIMITS)).toEqual([]);
		expect(selectRunnable([notYet], "p1", 1000, LIMITS).map((o) => o.id)).toEqual([notYet.id]);
	});

	it("ignores ops from another partition (tenant isolation)", () => {
		const other = op({ chainKey: "task:1", partition: "p2" });
		expect(selectRunnable([other], "p1", 100, LIMITS)).toEqual([]);
	});

	it("does not let an auth_paused op in another partition block this one", () => {
		const pausedElsewhere = op({ chainKey: "task:1", partition: "p2", status: "auth_paused" });
		const runnable = op({ chainKey: "task:1", partition: "p1" });
		const out = selectRunnable([pausedElsewhere, runnable], "p1", 100, LIMITS);
		expect(out.map((o) => o.id)).toEqual([runnable.id]);
	});

	it("excludes a head that needs replay confirmation", () => {
		const stale = op({ chainKey: "task:1", capturedAt: 0 });
		const now = LIMITS.maxReplayAgeMs + 1;
		expect(selectRunnable([stale], "p1", now, LIMITS)).toEqual([]);
	});
});

describe("applyOutcome", () => {
	it("marks success as synced, storing the result and clearing lastError", () => {
		const o = op({ lastError: err("temporary") });
		const out = applyOutcome(o, { ok: true, result: { done: true } }, 500);
		expect(out.status).toBe("synced");
		expect(out.result).toEqual({ done: true });
		expect(out.lastError).toBeUndefined();
		expect(out.syncedAt).toBe(500);
	});

	it("marks already_applied as synced", () => {
		const out = applyOutcome(op(), { ok: false, error: err("already_applied") }, 500);
		expect(out.status).toBe("synced");
		expect(out.syncedAt).toBe(500);
	});

	it("retries temporary failures with incremented attempts and backoff", () => {
		const out = applyOutcome(op({ attempts: 0 }), { ok: false, error: err("temporary") }, 1000);
		expect(out.status).toBe("pending");
		expect(out.attempts).toBe(1);
		expect(out.nextAttemptAt).toBe(1000 + backoffMs(1));
		expect(out.lastError?.class).toBe("temporary");
	});

	it("pauses on auth failures", () => {
		const out = applyOutcome(op(), { ok: false, error: err("auth") }, 500);
		expect(out.status).toBe("auth_paused");
		expect(out.lastError?.class).toBe("auth");
	});

	it("moves to conflict on conflict failures", () => {
		const out = applyOutcome(op(), { ok: false, error: err("conflict") }, 500);
		expect(out.status).toBe("conflict");
	});

	it.each(["permission", "permanent"] as const)("moves to failed on %s failures", (cls) => {
		const out = applyOutcome(op(), { ok: false, error: err(cls) }, 500);
		expect(out.status).toBe("failed");
		expect(out.lastError?.class).toBe(cls);
	});

	it("is pure — never mutates the input op", () => {
		const o = op();
		applyOutcome(o, { ok: false, error: err("permanent") }, 500);
		expect(o.status).toBe("pending");
	});
});

describe("backoffMs", () => {
	it("doubles from a 2s base", () => {
		expect(backoffMs(1)).toBe(2000);
		expect(backoffMs(2)).toBe(4000);
		expect(backoffMs(3)).toBe(8000);
		expect(backoffMs(4)).toBe(16000);
	});

	it("caps at 5 minutes", () => {
		expect(backoffMs(20)).toBe(5 * 60 * 1000);
	});

	it("is deterministic", () => {
		expect(backoffMs(5)).toBe(backoffMs(5));
	});
});

describe("canEnqueue", () => {
	it("allows enqueue under both ceilings", () => {
		expect(canEnqueue([], "p1", 100, LIMITS)).toEqual({ ok: true });
	});

	it("rejects when the op count ceiling would be exceeded", () => {
		const limits: QueueLimits = { ...LIMITS, maxOps: 1 };
		const existing = op({ partition: "p1" });
		expect(canEnqueue([existing], "p1", 0, limits)).toEqual({ ok: false, reason: "too_many_ops" });
	});

	it("rejects when the byte ceiling would be exceeded", () => {
		const limits: QueueLimits = { ...LIMITS, maxFileBytes: 100 };
		const existing = op({ partition: "p1", fileBytes: 60 });
		expect(canEnqueue([existing], "p1", 60, limits)).toEqual({ ok: false, reason: "too_many_bytes" });
	});

	it("only counts open ops in the target partition", () => {
		const limits: QueueLimits = { ...LIMITS, maxOps: 1 };
		const otherPartition = op({ partition: "p2" });
		const resolved = op({ partition: "p1", status: "synced" });
		expect(canEnqueue([otherPartition, resolved], "p1", 0, limits)).toEqual({ ok: true });
	});
});

describe("needsReplayConfirmation", () => {
	it("is false when within the replay window", () => {
		const o = op({ capturedAt: 0 });
		expect(needsReplayConfirmation(o, LIMITS.maxReplayAgeMs - 1, LIMITS)).toBe(false);
	});

	it("is true once the replay window has elapsed and not yet confirmed", () => {
		const o = op({ capturedAt: 0 });
		expect(needsReplayConfirmation(o, LIMITS.maxReplayAgeMs + 1, LIMITS)).toBe(true);
	});

	it("is false once the user has confirmed the replay", () => {
		const o = op({ capturedAt: 0, replayConfirmed: true });
		expect(needsReplayConfirmation(o, LIMITS.maxReplayAgeMs + 1, LIMITS)).toBe(false);
	});

	it("is false for a non-pending op", () => {
		const o = op({ capturedAt: 0, status: "syncing" });
		expect(needsReplayConfirmation(o, LIMITS.maxReplayAgeMs + 1, LIMITS)).toBe(false);
	});
});

describe("recoverAfterRestart", () => {
	it("moves syncing ops back to pending without touching attempts", () => {
		const syncing = op({ status: "syncing", attempts: 2 });
		const [out] = recoverAfterRestart([syncing]);
		expect(out.status).toBe("pending");
		expect(out.attempts).toBe(2);
	});

	it("leaves other statuses untouched", () => {
		const failed = op({ status: "failed" });
		const [out] = recoverAfterRestart([failed]);
		expect(out.status).toBe("failed");
	});
});

describe("resumeAuthPaused", () => {
	it("moves auth_paused ops in the target partition to pending with reset backoff", () => {
		const paused = op({ partition: "p1", status: "auth_paused", nextAttemptAt: 9999 });
		const [out] = resumeAuthPaused([paused], "p1");
		expect(out.status).toBe("pending");
		expect(out.nextAttemptAt).toBe(0);
	});

	it("leaves auth_paused ops in other partitions alone", () => {
		const paused = op({ partition: "p2", status: "auth_paused" });
		const [out] = resumeAuthPaused([paused], "p1");
		expect(out.status).toBe("auth_paused");
	});
});

describe("summarize", () => {
	it("counts open ops by status within the partition", () => {
		const ops = [
			op({ partition: "p1", status: "pending" }),
			op({ partition: "p1", status: "syncing" }),
			op({ partition: "p1", status: "failed" }),
			op({ partition: "p1", status: "conflict" }),
			op({ partition: "p2", status: "pending" }),
		];
		const s = summarize(ops, "p1", 0, LIMITS);
		expect(s).toMatchObject({ pending: 1, syncing: 1, failed: 1, conflict: 1, authPaused: false });
	});

	it("reports authPaused true when any op in the partition is auth_paused", () => {
		const ops = [op({ partition: "p1", status: "auth_paused" })];
		expect(summarize(ops, "p1", 0, LIMITS).authPaused).toBe(true);
	});

	it("reports lastSyncedAt as the max syncedAt among synced ops", () => {
		const ops = [
			op({ partition: "p1", status: "synced", syncedAt: 100 }),
			op({ partition: "p1", status: "synced", syncedAt: 300 }),
			op({ partition: "p1", status: "synced", syncedAt: 200 }),
		];
		expect(summarize(ops, "p1", 0, LIMITS).lastSyncedAt).toBe(300);
	});

	it("counts pending ops needing replay confirmation", () => {
		const stale = op({ partition: "p1", status: "pending", capturedAt: 0 });
		const s = summarize([stale], "p1", LIMITS.maxReplayAgeMs + 1, LIMITS);
		expect(s.needsConfirmation).toBe(1);
	});
});
