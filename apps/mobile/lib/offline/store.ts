import { useSyncExternalStore } from "react";
import * as Crypto from "expo-crypto";
import { COMMANDS, FILE_ARGS_KEY, type OperationArgs, type OperationName } from "./commands";
import { deleteDurable, type DurableFile } from "./files";
import {
	deletePartitionOutbox,
	insertOp,
	loadOps,
	pruneOps,
	purgePartitionCache,
	saveOp,
	type OpDisplay,
	type StoredOp,
} from "./db";
import { canEnqueue, DEFAULT_LIMITS, isOpen, recoverAfterRestart } from "./queue";

type Snapshot = { partition: string | null; ops: StoredOp[] };

let snapshot: Snapshot = { partition: null, ops: [] };
const listeners = new Set<() => void>();

function publish(next: Snapshot) {
	snapshot = next;
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function getSnapshot(): Snapshot {
	return snapshot;
}

export function useOutbox(): Snapshot {
	return useSyncExternalStore(subscribe, getSnapshot);
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function activatePartition(partition: string | null): Promise<void> {
	if (partition === snapshot.partition) return;
	if (!partition) {
		publish({ partition: null, ops: [] });
		return;
	}
	const loaded = loadOps(partition);
	const recovered = recoverAfterRestart(loaded) as StoredOp[];
	publish({ partition, ops: recovered });
	for (const op of recovered) {
		if (op.status !== loaded.find((o) => o.id === op.id)?.status) await saveOp(op);
	}
	const now = Date.now();
	const removed = await pruneOps(partition, now - DAY_MS, now - 30 * DAY_MS);
	if (removed.length > 0) {
		await deleteDurable(removed);
		if (snapshot.partition === partition) publish({ partition, ops: loadOps(partition) });
	}
}

export async function replaceOp(op: StoredOp): Promise<void> {
	await saveOp(op);
	if (snapshot.partition !== op.partition) return;
	publish({
		partition: snapshot.partition,
		ops: snapshot.ops.map((existing) => (existing.id === op.id ? op : existing)),
	});
}

type FileArgKeys<Name extends OperationName> = Name extends "quotes.approveInPerson"
	? "signatureStorageId"
	: never;

export type EnqueueArgs<Name extends OperationName> = Omit<OperationArgs<Name>, FileArgKeys<Name>>;

export type EnqueueOptions = {
	display: OpDisplay;
	files?: { argName: string; file: DurableFile }[];
	capturedAt?: number;
};

export type EnqueueResult =
	| { ok: true; op: StoredOp }
	| { ok: false; reason: "no_partition" | "too_many_ops" | "too_many_bytes" };

export async function enqueue<Name extends OperationName>(
	name: Name,
	args: EnqueueArgs<Name>,
	options: EnqueueOptions,
): Promise<EnqueueResult> {
	const { partition, ops } = snapshot;
	if (!partition) return { ok: false, reason: "no_partition" };
	const files = options.files ?? [];
	const fileBytes = files.reduce((sum, f) => sum + f.file.bytes, 0);
	const room = canEnqueue(ops, partition, fileBytes, DEFAULT_LIMITS);
	if (!room.ok) return { ok: false, reason: room.reason };

	const storedArgs =
		files.length > 0
			? { ...args, [FILE_ARGS_KEY]: Object.fromEntries(files.map((f) => [f.argName, f.file.id])) }
			: args;
	const chainKey = (COMMANDS[name].chainKey as (a: EnqueueArgs<Name>) => string)(args);
	const op = await insertOp(
		{
			partition,
			chainKey,
			operation: name,
			args: storedArgs,
			idempotencyKey: Crypto.randomUUID(),
			capturedAt: options.capturedAt ?? Date.now(),
			status: "pending",
			attempts: 0,
			nextAttemptAt: 0,
			fileBytes,
			replayConfirmed: false,
			display: options.display,
		},
		files.map((f) => ({
			id: f.file.id,
			partition,
			path: f.file.path,
			mime: f.file.mime,
			bytes: f.file.bytes,
		})),
	);
	if (snapshot.partition === partition) publish({ partition, ops: [...snapshot.ops, op] });
	return { ok: true, op };
}

export function openOps(): StoredOp[] {
	return snapshot.ops.filter(isOpen);
}

/** Drops the partition's cached reads; open work stays unless `discardOutbox`. */
export async function clearPartition(partition: string, discardOutbox: boolean): Promise<void> {
	await purgePartitionCache(partition);
	if (discardOutbox) {
		await deleteDurable(await deletePartitionOutbox(partition));
		if (snapshot.partition === partition) publish({ partition, ops: [] });
	}
}
