import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { AppState } from "react-native";
import { useOrganization, useUser } from "@clerk/expo";
import { ConvexError } from "convex/values";
import { useConvex, useConvexAuth, useConvexConnectionState, type ConvexReactClient } from "convex/react";
import { COMMANDS, FILE_ARGS_KEY, type FileArgMap, type OperationName } from "./commands";
import { classifyError, OfflineTimeoutError } from "./errors";
import { deleteDurable, durableExists, uploadDurable } from "./files";
import { loadFiles, setFileStorageId, type StoredOp } from "./db";
import { partitionKey } from "./partition";
import { PartitionContext } from "./partition-context";
import { applyOutcome, DEFAULT_LIMITS, isOpen, resumeAuthPaused, selectRunnable, summarize, type QueueSummary } from "./queue";
import { activatePartition, getSnapshot, replaceOp, useOutbox } from "./store";
import { useIsOnline } from "./network";

const MUTATION_TIMEOUT_MS = 30_000;

type OfflineContextValue = {
	partition: string | null;
	/** Device reachability hint (netinfo). */
	online: boolean;
	/** Convex socket connected and authenticated: queued work can send. */
	syncReady: boolean;
	summary: QueueSummary;
	ops: StoredOp[];
	drainNow: () => void;
	retry: (opId: number) => Promise<void>;
	confirmReplay: (opId: number) => Promise<void>;
	/** Marks a failed or conflicted op handled; it stops blocking its chain. */
	resolve: (opId: number) => Promise<void>;
};

const OfflineContext = createContext<OfflineContextValue | null>(null);

export function useOffline(): OfflineContextValue {
	const value = useContext(OfflineContext);
	if (!value) throw new Error("useOffline must be used inside OfflineProvider");
	return value;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new OfflineTimeoutError("Timed out waiting for the server")), ms);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(err) => {
				clearTimeout(timer);
				reject(err);
			},
		);
	});
}

async function prepareArgs(client: ConvexReactClient, op: StoredOp): Promise<Record<string, unknown>> {
	const { [FILE_ARGS_KEY]: fileArgs, ...args } = op.args as Record<string, unknown> & {
		[FILE_ARGS_KEY]?: FileArgMap;
	};
	if (!fileArgs) return args;
	const command = COMMANDS[op.operation as OperationName];
	const files = loadFiles(op.id);
	for (const [argName, fileId] of Object.entries(fileArgs)) {
		const file = files.find((f) => f.id === fileId);
		// Permanent: retrying can't bring a deleted file back, so it must reach Needs attention.
		if (!file || !(await durableExists(file.path))) {
			throw new ConvexError({ code: "FILE_MISSING", message: "The saved file for this change is missing on this phone." });
		}
		let storageId = file.storageId;
		if (!storageId) {
			if (!command.uploadUrlRef) {
				throw new ConvexError({ code: "BAD_REQUEST", message: `${op.operation} can't upload files.` });
			}
			const url = await withTimeout(client.mutation(command.uploadUrlRef, {}), MUTATION_TIMEOUT_MS);
			storageId = await uploadDurable(url, file.path, file.mime);
			// Persisted so a crash after upload doesn't upload the file again.
			await setFileStorageId(file.id, storageId);
		}
		args[argName] = storageId;
	}
	return args;
}

async function runOp(client: ConvexReactClient, op: StoredOp): Promise<void> {
	await replaceOp({ ...op, status: "syncing" });
	let next: StoredOp;
	try {
		const args = await prepareArgs(client, op);
		const command = COMMANDS[op.operation as OperationName];
		const result = await withTimeout(
			client.mutation(command.ref, { ...args, idempotencyKey: op.idempotencyKey } as never),
			MUTATION_TIMEOUT_MS,
		);
		next = applyOutcome(op, { ok: true, result: result ?? null }, Date.now()) as StoredOp;
	} catch (err) {
		next = applyOutcome(op, { ok: false, error: classifyError(err) }, Date.now()) as StoredOp;
	}
	await replaceOp(next);
	if (next.status === "synced") {
		await deleteDurable(loadFiles(op.id).map((f) => f.path));
	}
}

const EMPTY_SUMMARY: QueueSummary = {
	pending: 0,
	syncing: 0,
	failed: 0,
	conflict: 0,
	authPaused: false,
	needsConfirmation: 0,
};

function summarizeNow(ops: StoredOp[], partition: string | null): QueueSummary {
	return partition ? summarize(ops, partition, Date.now(), DEFAULT_LIMITS) : EMPTY_SUMMARY;
}

export function OfflineProvider({ children }: { children: ReactNode }) {
	const { user } = useUser();
	const { organization } = useOrganization();
	const client = useConvex();
	const connection = useConvexConnectionState();
	const { isAuthenticated } = useConvexAuth();
	const online = useIsOnline();
	const { ops } = useOutbox();

	const deploymentUrl = process.env.EXPO_PUBLIC_CONVEX_URL ?? "";
	const partition =
		user?.id && organization?.id && deploymentUrl
			? partitionKey({ deploymentUrl, userId: user.id, orgId: organization.id })
			: null;

	useEffect(() => {
		void activatePartition(partition);
	}, [partition]);

	const syncReady = connection.isWebSocketConnected && isAuthenticated && partition !== null;
	const readyRef = useRef(syncReady);
	const partitionRef = useRef(partition);
	useEffect(() => {
		readyRef.current = syncReady;
		partitionRef.current = partition;
	}, [syncReady, partition]);

	const mounted = useRef(true);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);
	const running = useRef(false);
	const rerun = useRef(false);
	const wakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const drain = useCallback(async () => {
		if (running.current) {
			rerun.current = true;
			return;
		}
		running.current = true;
		// The provider remounts per org; an old instance must never send another partition's ops.
		const stillActive = (active: string) =>
			mounted.current &&
			readyRef.current &&
			partitionRef.current === active &&
			getSnapshot().partition === active;
		try {
			for (;;) {
				const active = partitionRef.current;
				if (!active || !stillActive(active)) break;
				const runnable = selectRunnable(getSnapshot().ops, active, Date.now(), DEFAULT_LIMITS);
				if (runnable.length === 0) break;
				for (const op of runnable) {
					if (!stillActive(active)) break;
					await runOp(client, op as StoredOp);
				}
			}
		} finally {
			running.current = false;
			if (wakeTimer.current) clearTimeout(wakeTimer.current);
			const waiting = getSnapshot().ops.filter((o) => isOpen(o) && o.status === "pending" && o.nextAttemptAt > Date.now());
			if (waiting.length > 0 && mounted.current) {
				const soonest = Math.min(...waiting.map((o) => o.nextAttemptAt));
				wakeTimer.current = setTimeout(() => void drain(), Math.max(0, soonest - Date.now()));
			}
			if (rerun.current && mounted.current) {
				rerun.current = false;
				void drain();
			}
		}
	}, [client]);

	useEffect(() => {
		if (!syncReady || !partition) return;
		const paused = getSnapshot().ops.filter((o) => o.partition === partition && o.status === "auth_paused");
		void (async () => {
			for (const op of resumeAuthPaused(paused, partition)) await replaceOp(op as StoredOp);
			void drain();
		})();
	}, [syncReady, partition, drain]);

	const openCount = ops.filter(isOpen).length;
	useEffect(() => {
		if (syncReady && openCount > 0) void drain();
	}, [syncReady, openCount, drain]);

	useEffect(() => {
		const sub = AppState.addEventListener("change", (state) => {
			if (state === "active") void drain();
		});
		return () => sub.remove();
	}, [drain]);

	useEffect(() => () => {
		if (wakeTimer.current) clearTimeout(wakeTimer.current);
	}, []);

	const update = useCallback(async (opId: number, patch: (op: StoredOp) => StoredOp) => {
		const op = getSnapshot().ops.find((o) => o.id === opId);
		if (!op) return;
		await replaceOp(patch(op));
		void drain();
	}, [drain]);

	const value = useMemo<OfflineContextValue>(
		() => ({
			partition,
			online,
			syncReady,
			summary: summarizeNow(ops, partition),
			ops,
			drainNow: () => void drain(),
			retry: (opId) =>
				update(opId, (op) => ({ ...op, status: "pending", nextAttemptAt: 0, lastError: undefined })),
			confirmReplay: (opId) => update(opId, (op) => ({ ...op, replayConfirmed: true })),
			resolve: (opId) => update(opId, (op) => ({ ...op, resolvedAt: Date.now() })),
		}),
		[partition, online, syncReady, ops, drain, update],
	);

	return (
		<PartitionContext.Provider value={partition}>
			<OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>
		</PartitionContext.Provider>
	);
}
