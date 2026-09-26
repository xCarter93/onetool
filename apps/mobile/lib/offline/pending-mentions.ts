import type { StoredOp } from "./db";

export type PendingMentionItem = {
	_id: string;
	message: string;
	createdAt: number;
	authorType: "user";
	authorName: string;
	hasAttachments: false;
	pending: true;
};

/**
 * Queued `notifications.createMention` ops for one chain, shaped like a feed
 * row so they render alongside synced messages while not yet sent. Only
 * attachment-free mentions are ever queued, so `hasAttachments` is always false.
 */
export function pendingMentions(ops: Pick<StoredOp, "id" | "args" | "capturedAt">[], authorName: string): PendingMentionItem[] {
	const items: PendingMentionItem[] = [];
	for (const op of ops) {
		const args = op.args as { message?: unknown } | null | undefined;
		if (!args || typeof args.message !== "string") continue;
		items.push({
			_id: `pending-${op.id}`,
			message: args.message,
			createdAt: op.capturedAt,
			authorType: "user",
			authorName,
			hasAttachments: false,
			pending: true,
		});
	}
	return items;
}
