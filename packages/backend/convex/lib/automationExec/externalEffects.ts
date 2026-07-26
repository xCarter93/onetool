import { Id } from "../../_generated/dataModel";
import { MutationCtx } from "../../_generated/server";
import { sendOutbound, type SendResult } from "../../email/outbound";
import type { OutboundMessage } from "../../email/types";
import { enqueuePushViaPool } from "../../push";

/**
 * WS3: the single choke point through which automation runs touch the outside
 * world. Email rides the durable @convex-dev/resend component (own queue/
 * batch/retry — transactional with this mutation, no scheduler hop); push and
 * future webhook/SMS effects ride the maxParallelism-bounded externalIoPool.
 * `executionId`/`nodeId` identify the run node for the WS3 remainder
 * (workpool onComplete outcome-writeback) and future per-effect telemetry.
 */
export type ExternalEffect =
	| { kind: "email"; orgId: Id<"organizations">; message: OutboundMessage }
	| {
			kind: "push";
			notificationType: string;
			taggedUserId: Id<"users">;
			title: string;
			body: string;
			url: string;
			notificationId: Id<"notifications">;
			/** Clerk org id (push payload targeting), not a Convex organizations id. */
			orgId: string;
	  };

export type ExternalEffectResult =
	| { kind: "email"; send: SendResult }
	| { kind: "push"; enqueued: true };

export async function runExternalEffect(
	ctx: MutationCtx,
	executionId: Id<"workflowExecutions">,
	nodeId: string,
	effect: ExternalEffect
): Promise<ExternalEffectResult> {
	switch (effect.kind) {
		case "email": {
			const send = await sendOutbound(ctx, effect.orgId, effect.message);
			return { kind: "email", send };
		}
		case "push": {
			await enqueuePushViaPool(ctx, {
				notificationType: effect.notificationType,
				taggedUserId: effect.taggedUserId,
				title: effect.title,
				body: effect.body,
				url: effect.url,
				notificationId: effect.notificationId,
				orgId: effect.orgId,
			});
			return { kind: "push", enqueued: true };
		}
	}
}
