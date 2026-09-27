import { useCallback, useMemo } from "react";
import { Alert } from "react-native";
import type { StoredOp } from "./db";
import type { OperationName } from "./commands";
import { useOffline } from "./OfflineProvider";
import { isOpen } from "./queue";
import { enqueue, type EnqueueArgs, type EnqueueOptions } from "./store";

/** Open (unsynced, unresolved) ops, optionally for one entity chain like `task:<id>`. */
export function useOpenOps(chainKey?: string): StoredOp[] {
	const { ops } = useOffline();
	return useMemo(
		() => ops.filter((op) => isOpen(op) && (chainKey === undefined || op.chainKey === chainKey)),
		[ops, chainKey],
	);
}

const FULL_MESSAGE =
	"This phone is holding as many unsynced changes as it can. Connect to sync them before adding more.";

/** Enqueues and explains a refusal; resolves true once the change is saved on the device. */
export async function saveOffline<Name extends OperationName>(
	name: Name,
	args: EnqueueArgs<Name>,
	options: EnqueueOptions,
): Promise<boolean> {
	const result = await enqueue(name, args, options);
	if (result.ok) return true;
	Alert.alert(
		"Couldn't save this change",
		result.reason === "no_partition" ? "Sign in again to keep working." : FULL_MESSAGE,
	);
	return false;
}

/** Thrown by `useRequireOnline` after it has already told the user why. */
export class OfflineBlockedError extends Error {}

/** For submits inside an already-open sheet: explains and throws when offline, so the sheet stays open. */
export function useRequireOnline() {
	const { online } = useOffline();
	return useCallback(
		(what: string) => {
			if (online) return;
			Alert.alert("Needs a connection", `${what} needs a connection. Try again when you have signal.`);
			throw new OfflineBlockedError(what);
		},
		[online],
	);
}

/** Runs `action` when online; otherwise explains that `what` needs a connection. */
export function useOnlineAction() {
	const { online } = useOffline();
	return useCallback(
		(what: string, action: () => void) => {
			if (online) {
				action();
				return;
			}
			Alert.alert("Needs a connection", `${what} needs a connection. Try again when you have signal.`);
		},
		[online],
	);
}
