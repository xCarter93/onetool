import { describe, expect, it } from "vitest";
import {
	discardPaymentWarning,
	formatAge,
	isPaymentOp,
	opStatusText,
	orgSwitchPendingMessage,
	signOutGuardMessage,
	sortSyncIssues,
	summarizePendingOps,
	syncStatusLine,
	type SyncLineInput,
} from "./sync-copy";
import { DEFAULT_LIMITS } from "./queue";
import type { StoredOp } from "./db";

const EMPTY_SUMMARY = {
	pending: 0,
	syncing: 0,
	failed: 0,
	conflict: 0,
	authPaused: false,
	needsConfirmation: 0,
} as const;

function line(overrides: Partial<SyncLineInput>) {
	return syncStatusLine({
		online: true,
		summary: EMPTY_SUMMARY,
		oldestCachedReadAgeMs: null,
		now: 0,
		...overrides,
	});
}

describe("formatAge", () => {
	it("reads as just now under a minute", () => {
		expect(formatAge(30_000)).toBe("just now");
	});
	it("reads in minutes under an hour", () => {
		expect(formatAge(5 * 60_000)).toBe("5m ago");
	});
	it("reads in hours under a day", () => {
		expect(formatAge(3 * 60 * 60_000)).toBe("3h ago");
	});
	it("reads in days past a day", () => {
		expect(formatAge(2 * 24 * 60 * 60_000)).toBe("2d ago");
	});
});

describe("syncStatusLine", () => {
	it("is hidden when online and fully synced with nothing cached", () => {
		expect(line({})).toBeNull();
	});

	it("shows auth_paused with top severity", () => {
		const result = line({
			summary: { ...EMPTY_SUMMARY, authPaused: true, pending: 1, conflict: 1 },
		});
		expect(result).toEqual({ text: "Sign in to finish syncing", tone: "danger", tappable: true });
	});

	it("shows conflict/failed as needing attention and tappable", () => {
		const result = line({ summary: { ...EMPTY_SUMMARY, failed: 1, conflict: 1 } });
		expect(result?.tone).toBe("danger");
		expect(result?.tappable).toBe(true);
		expect(result?.text).toContain("2 changes");
	});

	it("shows needs-confirmation for old ops", () => {
		const result = line({ summary: { ...EMPTY_SUMMARY, needsConfirmation: 1 } });
		expect(result?.tone).toBe("warning");
		expect(result?.text).toContain("1 old change");
	});

	it("shows syncing without a tap target", () => {
		const result = line({ summary: { ...EMPTY_SUMMARY, syncing: 2 } });
		expect(result).toEqual({ text: "Syncing 2 changes…", tone: "frostedInk", tappable: false });
	});

	it("shows pending offline with the will-sync caveat", () => {
		const result = line({ online: false, summary: { ...EMPTY_SUMMARY, pending: 3 } });
		expect(result?.text).toBe("3 changes saved on this phone, will sync when you're back online");
		expect(result?.tone).toBe("sub");
	});

	it("shows pending online without the offline caveat", () => {
		const result = line({ online: true, summary: { ...EMPTY_SUMMARY, pending: 1 } });
		expect(result?.text).toBe("1 change saved on this phone");
	});

	it("shows offline age when nothing is pending", () => {
		const result = line({ online: false, oldestCachedReadAgeMs: 2 * 60 * 60_000 });
		expect(result?.text).toBe("Offline · showing your day from 2h ago");
		expect(result?.tone).toBe("faint");
	});

	it("escalates offline age past a day to warning", () => {
		const result = line({ online: false, oldestCachedReadAgeMs: 2 * 24 * 60 * 60_000 });
		expect(result?.tone).toBe("warning");
	});

	it("shows just-synced transiently, then fades", () => {
		const justSynced = line({ summary: { ...EMPTY_SUMMARY, lastSyncedAt: 1000 }, now: 2000 });
		expect(justSynced).toEqual({ text: "Synced just now", tone: "success", tappable: false });

		const faded = line({ summary: { ...EMPTY_SUMMARY, lastSyncedAt: 1000 }, now: 20_000 });
		expect(faded).toBeNull();
	});

	it("shows stale-cache age while online once synced fade has passed", () => {
		const result = line({ oldestCachedReadAgeMs: 30 * 60_000 });
		expect(result?.text).toBe("Showing data from 30m ago");
	});

	it("respects DEFAULT_LIMITS.maxReplayAgeMs as the age that would need confirmation upstream", () => {
		expect(DEFAULT_LIMITS.maxReplayAgeMs).toBeGreaterThan(0);
	});
});

function op(overrides: Partial<StoredOp>): StoredOp {
	return {
		id: 1,
		partition: "p",
		chainKey: "task:1",
		operation: "tasks.complete",
		args: {},
		idempotencyKey: "k",
		capturedAt: 0,
		status: "pending",
		attempts: 0,
		nextAttemptAt: 0,
		fileBytes: 0,
		replayConfirmed: false,
		display: { title: "Complete: Mow lawn" },
		...overrides,
	};
}

describe("summarizePendingOps", () => {
	it("counts only open ops and separates payments", () => {
		const ops = [
			op({ id: 1 }),
			op({ id: 2, status: "synced", syncedAt: 5 }),
			op({ id: 3, resolvedAt: 5, status: "failed" }),
			op({ id: 4, operation: "payments.recordManualPayment", chainKey: "invoice:1" }),
		];
		expect(summarizePendingOps(ops)).toEqual({ count: 2, paymentCount: 1 });
	});
});

describe("signOutGuardMessage", () => {
	it("names the count and singular/plural correctly", () => {
		expect(signOutGuardMessage({ count: 1, paymentCount: 0 })).toContain("1 change");
		expect(signOutGuardMessage({ count: 1, paymentCount: 0 })).toContain("discard it");
		expect(signOutGuardMessage({ count: 3, paymentCount: 0 })).toContain("3 changes");
		expect(signOutGuardMessage({ count: 3, paymentCount: 0 })).toContain("discard them");
	});

	it("calls out payments explicitly", () => {
		const message = signOutGuardMessage({ count: 2, paymentCount: 1 });
		expect(message).toContain("1 recorded payment");
		expect(message).toContain("cash is already in hand");
	});
});

describe("orgSwitchPendingMessage", () => {
	it("is null when nothing is pending", () => {
		expect(orgSwitchPendingMessage({ count: 0, paymentCount: 0 })).toBeNull();
	});

	it("names the count without blocking language", () => {
		const message = orgSwitchPendingMessage({ count: 2, paymentCount: 0 });
		expect(message).toContain("2 unsynced changes");
		expect(message).toContain("sync automatically");
	});
});

describe("sortSyncIssues / issueSeverityRank", () => {
	it("puts payment conflicts and failures first, then other issues, then pending", () => {
		const ops = [
			op({ id: 1, status: "pending", capturedAt: 1 }),
			op({ id: 2, status: "failed", capturedAt: 2 }),
			op({
				id: 3,
				status: "conflict",
				operation: "payments.recordManualPayment",
				chainKey: "invoice:1",
				capturedAt: 3,
			}),
			op({ id: 4, status: "auth_paused", capturedAt: 4 }),
		];
		const sorted = sortSyncIssues(ops, 100);
		expect(sorted.map((o) => o.id)).toEqual([3, 2, 4, 1]);
	});

	it("orders same-severity ops oldest first", () => {
		const ops = [
			op({ id: 1, status: "failed", capturedAt: 50 }),
			op({ id: 2, status: "failed", capturedAt: 10 }),
		];
		expect(sortSyncIssues(ops, 100).map((o) => o.id)).toEqual([2, 1]);
	});

	it("ranks an op past the replay-confirmation age above a fresh pending op", () => {
		const now = 100 * 24 * 60 * 60 * 1000;
		const ops = [
			op({ id: 1, status: "pending", capturedAt: now - 1000 }),
			op({ id: 2, status: "pending", capturedAt: 0 }),
		];
		expect(sortSyncIssues(ops, now).map((o) => o.id)).toEqual([2, 1]);
	});
});

describe("opStatusText", () => {
	it("surfaces the server's message on conflict and failed", () => {
		expect(opStatusText(op({ status: "conflict", lastError: { class: "conflict", message: "Changed" } }), 0).text).toBe(
			"Changed",
		);
		expect(opStatusText(op({ status: "failed", lastError: { class: "permanent", message: "Rejected" } }), 0).text).toBe(
			"Rejected",
		);
	});

	it("flags auth_paused and syncing distinctly", () => {
		expect(opStatusText(op({ status: "auth_paused" }), 0).tone).toBe("danger");
		expect(opStatusText(op({ status: "syncing" }), 0).text).toBe("Syncing…");
	});

	it("flags a pending op past the replay age as needing confirmation", () => {
		const now = 100 * 24 * 60 * 60 * 1000;
		const result = opStatusText(op({ status: "pending", capturedAt: 0 }), now);
		expect(result.tone).toBe("warning");
	});
});

describe("discardPaymentWarning", () => {
	it("names the count and explains the cash is still in hand", () => {
		const message = discardPaymentWarning(2);
		expect(message).toContain("2 recorded payments");
		expect(message).toContain("cash");
		expect(message).toContain("already in hand");
	});
});

describe("isPaymentOp", () => {
	it("matches the manual payment operation only", () => {
		expect(isPaymentOp(op({ operation: "payments.recordManualPayment" }))).toBe(true);
		expect(isPaymentOp(op({ operation: "tasks.complete" }))).toBe(false);
	});
});
