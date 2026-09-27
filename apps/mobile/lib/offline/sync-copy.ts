import { DEFAULT_LIMITS, isOpen, needsReplayConfirmation } from "./queue";
import type { QueueLimits, QueueSummary } from "./queue";
import type { StoredOp } from "./db";

/** Token key on `useTokens()` that carries the line's color. */
export type SyncLineTone = "sub" | "frostedInk" | "success" | "warning" | "danger" | "faint";

export type SyncLine = { text: string; tone: SyncLineTone; tappable: boolean };

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const SYNCED_FADE_MS = 8_000;

export function formatAge(ms: number): string {
	if (ms < 60_000) return "just now";
	const minutes = Math.round(ms / 60_000);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.round(ms / HOUR_MS);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.round(ms / DAY_MS);
	return `${days}d ago`;
}

function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export type SyncLineInput = {
	online: boolean;
	summary: QueueSummary;
	/** Age (ms) of the oldest cached read on screen, or null when everything is live. */
	oldestCachedReadAgeMs: number | null;
	now: number;
};

/**
 * The persistent status line's text + tone. Returns null when there is nothing to
 * say (online, fully synced, no cached data on screen) — hidden per the Daybook
 * "quiet when nothing's wrong" rule. Priority: auth > conflict/failed > needs
 * confirmation > syncing > pending > offline age > just-synced > stale age.
 */
export function syncStatusLine(input: SyncLineInput): SyncLine | null {
	const { online, summary, oldestCachedReadAgeMs, now } = input;
	const { pending, syncing, failed, conflict, authPaused, needsConfirmation, lastSyncedAt } = summary;

	if (authPaused) {
		return { text: "Sign in to finish syncing", tone: "danger", tappable: true };
	}

	const blocked = conflict + failed;
	if (blocked > 0) {
		return { text: `${plural(blocked, "change")} need${blocked === 1 ? "s" : ""} attention`, tone: "danger", tappable: true };
	}

	if (needsConfirmation > 0) {
		return {
			text: `${plural(needsConfirmation, "old change")} need${needsConfirmation === 1 ? "s" : ""} your OK before sending`,
			tone: "warning",
			tappable: true,
		};
	}

	if (syncing > 0) {
		return { text: `Syncing ${plural(syncing, "change")}…`, tone: "frostedInk", tappable: false };
	}

	if (pending > 0) {
		const base = `${plural(pending, "change")} saved on this phone`;
		return {
			text: online ? base : `${base}, will sync when you're back online`,
			tone: "sub",
			tappable: false,
		};
	}

	if (!online) {
		return oldestCachedReadAgeMs === null
			? { text: "Offline", tone: "faint", tappable: false }
			: {
					text: `Offline · showing your day from ${formatAge(oldestCachedReadAgeMs)}`,
					tone: oldestCachedReadAgeMs > DAY_MS ? "warning" : "faint",
					tappable: false,
				};
	}

	if (lastSyncedAt !== undefined && now - lastSyncedAt < SYNCED_FADE_MS) {
		return { text: "Synced just now", tone: "success", tappable: false };
	}

	if (oldestCachedReadAgeMs !== null) {
		return {
			text: `Showing data from ${formatAge(oldestCachedReadAgeMs)}`,
			tone: oldestCachedReadAgeMs > DAY_MS ? "warning" : "faint",
			tappable: false,
		};
	}

	return null;
}

export type PendingWorkSummary = { count: number; paymentCount: number };

/** Open (unsynced, unresolved) ops for a partition, and how many are payments. */
export function summarizePendingOps(ops: StoredOp[]): PendingWorkSummary {
	const open = ops.filter(isOpen);
	return {
		count: open.length,
		paymentCount: open.filter((op) => op.operation === "payments.recordManualPayment").length,
	};
}

/** Sign-out / delete-account guard copy — names the payment risk explicitly. */
export function signOutGuardMessage(summary: PendingWorkSummary): string {
	let message = `This phone has ${plural(summary.count, "change")} that ${summary.count === 1 ? "hasn't" : "haven't"} reached the server yet. Signing out now would discard ${summary.count === 1 ? "it" : "them"}.`;
	if (summary.paymentCount > 0) {
		message += ` That includes ${plural(summary.paymentCount, "recorded payment")} — the cash is already in hand and still needs to be handled.`;
	}
	return message;
}

/** Second-step warning before discarding pending work that includes payments. */
export function discardPaymentWarning(paymentCount: number): string {
	return `The cash from ${plural(paymentCount, "recorded payment")} is already in hand. Discarding now removes that record from this phone — you'll still need to return it or record it on the web.`;
}

/** Org-switch notice when the org being left has unsynced work. Null when there's none. */
export function orgSwitchPendingMessage(summary: PendingWorkSummary): string | null {
	if (summary.count === 0) return null;
	return `This organization has ${plural(summary.count, "unsynced change")}. They'll sync automatically next time you're back here and online.`;
}

const PAYMENT_OPERATION = "payments.recordManualPayment";

/** Lower sorts first: payment conflicts/failures are unmissable at the top. */
export function issueSeverityRank(op: StoredOp, now: number, limits: QueueLimits = DEFAULT_LIMITS): number {
	const isPayment = op.operation === PAYMENT_OPERATION;
	if ((op.status === "conflict" || op.status === "failed") && isPayment) return 0;
	if (op.status === "conflict" || op.status === "failed") return 1;
	if (op.status === "auth_paused") return 2;
	if (needsReplayConfirmation(op, now, limits)) return 3;
	if (op.status === "syncing") return 4;
	return 5;
}

/** Sync issues screen order: most severe (payment conflicts) first, oldest within a tier first. */
export function sortSyncIssues(ops: StoredOp[], now: number, limits: QueueLimits = DEFAULT_LIMITS): StoredOp[] {
	return [...ops].sort((a, b) => {
		const rank = issueSeverityRank(a, now, limits) - issueSeverityRank(b, now, limits);
		return rank !== 0 ? rank : a.capturedAt - b.capturedAt;
	});
}

export type OpStatusText = { text: string; tone: SyncLineTone };

/** Per-row status line for the sync issues screen. */
export function opStatusText(op: StoredOp, now: number, limits: QueueLimits = DEFAULT_LIMITS): OpStatusText {
	if (op.status === "auth_paused") return { text: "Paused — sign in to continue", tone: "danger" };
	if (op.status === "conflict") {
		return { text: op.lastError?.message ?? "This record changed on the server", tone: "danger" };
	}
	if (op.status === "failed") {
		return { text: op.lastError?.message ?? "The server rejected this change", tone: "danger" };
	}
	if (op.status === "syncing") return { text: "Syncing…", tone: "frostedInk" };
	if (needsReplayConfirmation(op, now, limits)) {
		return { text: "Captured a while ago — needs your OK before it sends", tone: "warning" };
	}
	return { text: "Waiting to sync", tone: "sub" };
}

export function isPaymentOp(op: StoredOp): boolean {
	return op.operation === PAYMENT_OPERATION;
}
