import { api } from "@onetool/backend/convex/_generated/api";
import type { FunctionArgs, FunctionReference } from "convex/server";

type MutationRef = FunctionReference<"mutation">;

export type CommandArgs<Ref extends MutationRef> = Omit<FunctionArgs<Ref>, "idempotencyKey">;

type Command<Ref extends MutationRef> = {
	ref: Ref;
	chainKey: (args: CommandArgs<Ref>) => string;
	/** Mutation that mints an upload URL for this command's queued files. */
	uploadUrlRef?: FunctionReference<"mutation", "public", Record<string, never>, string>;
};

function command<Ref extends MutationRef>(
	ref: Ref,
	chainKey: (args: CommandArgs<Ref>) => string,
	uploadUrlRef?: Command<Ref>["uploadUrlRef"],
): Command<Ref> {
	return { ref, chainKey, uploadUrlRef };
}

export const COMMANDS = {
	"tasks.complete": command(api.tasks.complete, (a) => `task:${a.id}`),
	"tasks.update": command(api.tasks.update, (a) => `task:${a.id}`),
	"routes.setStopStatus": command(api.routes.setStopStatus, (a) => `route:${a.routeId}`),
	"routes.startRoute": command(api.routes.startRoute, (a) => `route:${a.routeId}`),
	"routes.completeRoute": command(api.routes.completeRoute, (a) => `route:${a.routeId}`),
	"projects.update": command(api.projects.update, (a) => `project:${a.id}`),
	"clients.update": command(api.clients.update, (a) => `client:${a.id}`),
	"notifications.createMention": command(
		api.notifications.createMention,
		// Own chain: a failed message must never block edits or approvals on the record.
		(a) => `mention:${a.entityType}:${a.entityId}`,
	),
	"payments.recordManualPayment": command(
		api.payments.recordManualPayment,
		(a) => `invoice:${a.invoiceId}`,
	),
	"quotes.approveInPerson": command(
		api.quotes.approveInPerson,
		(a) => `quote:${a.id}`,
		api.quotes.generateSignatureUploadUrl,
	),
} as const;

export type OperationName = keyof typeof COMMANDS;

export type OperationArgs<Name extends OperationName> = CommandArgs<(typeof COMMANDS)[Name]["ref"]>;

/** Args key under which queued file ids wait for their uploaded storage ids. */
export const FILE_ARGS_KEY = "__files";

export type FileArgMap = Record<string, string>;
