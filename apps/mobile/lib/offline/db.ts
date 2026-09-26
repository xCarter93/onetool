import * as SQLite from "expo-sqlite";
import type { ClassifiedError } from "./errors";
import type { OutboxOp, OpStatus } from "./queue";

export type OpDisplay = { title: string; detail?: string };

export type StoredOp = OutboxOp & { display: OpDisplay };

export type OutboxFile = {
	id: string;
	opId: number;
	partition: string;
	path: string;
	mime: string;
	bytes: number;
	storageId?: string;
};

export type CacheEntry = { value: unknown; fetchedAt: number };

const SCHEMA_VERSION = 1;

let db: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
	if (db) return db;
	db = SQLite.openDatabaseSync("onetool-offline.db");
	migrate(db);
	return db;
}

function migrate(conn: SQLite.SQLiteDatabase) {
	conn.execSync("PRAGMA journal_mode = WAL");
	const row = conn.getFirstSync<{ user_version: number }>("PRAGMA user_version");
	const version = row?.user_version ?? 0;
	if (version >= SCHEMA_VERSION) return;
	if (version < 1) {
		conn.execSync(`
			CREATE TABLE IF NOT EXISTS outbox (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				partition TEXT NOT NULL,
				chain_key TEXT NOT NULL,
				operation TEXT NOT NULL,
				args TEXT NOT NULL,
				idempotency_key TEXT NOT NULL UNIQUE,
				captured_at INTEGER NOT NULL,
				status TEXT NOT NULL,
				attempts INTEGER NOT NULL DEFAULT 0,
				next_attempt_at INTEGER NOT NULL DEFAULT 0,
				file_bytes INTEGER NOT NULL DEFAULT 0,
				replay_confirmed INTEGER NOT NULL DEFAULT 0,
				last_error TEXT,
				result TEXT,
				resolved_at INTEGER,
				synced_at INTEGER,
				display TEXT NOT NULL
			);
			CREATE INDEX IF NOT EXISTS outbox_by_partition ON outbox (partition, id);
			CREATE TABLE IF NOT EXISTS outbox_files (
				id TEXT PRIMARY KEY,
				op_id INTEGER NOT NULL,
				partition TEXT NOT NULL,
				path TEXT NOT NULL,
				mime TEXT NOT NULL,
				bytes INTEGER NOT NULL,
				storage_id TEXT
			);
			CREATE INDEX IF NOT EXISTS outbox_files_by_op ON outbox_files (op_id);
			CREATE TABLE IF NOT EXISTS query_cache (
				partition TEXT NOT NULL,
				key TEXT NOT NULL,
				value TEXT NOT NULL,
				fetched_at INTEGER NOT NULL,
				PRIMARY KEY (partition, key)
			);
			CREATE TABLE IF NOT EXISTS partition_meta (
				partition TEXT PRIMARY KEY,
				last_online_at INTEGER NOT NULL
			);
		`);
	}
	conn.execSync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

type OutboxRow = {
	id: number;
	partition: string;
	chain_key: string;
	operation: string;
	args: string;
	idempotency_key: string;
	captured_at: number;
	status: string;
	attempts: number;
	next_attempt_at: number;
	file_bytes: number;
	replay_confirmed: number;
	last_error: string | null;
	result: string | null;
	resolved_at: number | null;
	synced_at: number | null;
	display: string;
};

function parseJson<T>(text: string | null): T | undefined {
	if (text === null) return undefined;
	try {
		return JSON.parse(text) as T;
	} catch {
		return undefined;
	}
}

function toOp(row: OutboxRow): StoredOp {
	return {
		id: row.id,
		partition: row.partition,
		chainKey: row.chain_key,
		operation: row.operation,
		args: parseJson(row.args),
		idempotencyKey: row.idempotency_key,
		capturedAt: row.captured_at,
		status: row.status as OpStatus,
		attempts: row.attempts,
		nextAttemptAt: row.next_attempt_at,
		fileBytes: row.file_bytes,
		replayConfirmed: row.replay_confirmed === 1,
		lastError: parseJson<ClassifiedError>(row.last_error),
		result: parseJson(row.result),
		resolvedAt: row.resolved_at ?? undefined,
		syncedAt: row.synced_at ?? undefined,
		display: parseJson<OpDisplay>(row.display) ?? { title: row.operation },
	};
}

export function loadOps(partition: string): StoredOp[] {
	return getDb()
		.getAllSync<OutboxRow>("SELECT * FROM outbox WHERE partition = ? ORDER BY id", [partition])
		.map(toOp);
}

export type NewOp = Omit<StoredOp, "id">;
export type NewFile = Omit<OutboxFile, "opId">;

export async function insertOp(op: NewOp, files: NewFile[]): Promise<StoredOp> {
	let id = 0;
	await getDb().withExclusiveTransactionAsync(async (txn) => {
		const res = await txn.runAsync(
			`INSERT INTO outbox (partition, chain_key, operation, args, idempotency_key, captured_at, status,
				attempts, next_attempt_at, file_bytes, replay_confirmed, display)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				op.partition,
				op.chainKey,
				op.operation,
				JSON.stringify(op.args ?? null),
				op.idempotencyKey,
				op.capturedAt,
				op.status,
				op.attempts,
				op.nextAttemptAt,
				op.fileBytes,
				op.replayConfirmed ? 1 : 0,
				JSON.stringify(op.display),
			],
		);
		id = res.lastInsertRowId;
		for (const file of files) {
			await txn.runAsync(
				`INSERT INTO outbox_files (id, op_id, partition, path, mime, bytes, storage_id)
				VALUES (?, ?, ?, ?, ?, ?, ?)`,
				[file.id, id, file.partition, file.path, file.mime, file.bytes, file.storageId ?? null],
			);
		}
	});
	return { ...op, id };
}

export async function saveOp(op: StoredOp): Promise<void> {
	await getDb().withExclusiveTransactionAsync(async (txn) => {
		await txn.runAsync(
			`UPDATE outbox SET status = ?, attempts = ?, next_attempt_at = ?, replay_confirmed = ?,
				last_error = ?, result = ?, resolved_at = ?, synced_at = ?
			WHERE id = ?`,
			[
				op.status,
				op.attempts,
				op.nextAttemptAt,
				op.replayConfirmed ? 1 : 0,
				op.lastError ? JSON.stringify(op.lastError) : null,
				op.result === undefined ? null : JSON.stringify(op.result),
				op.resolvedAt ?? null,
				op.syncedAt ?? null,
				op.id,
			],
		);
	});
}

export function loadFiles(opId: number): OutboxFile[] {
	return getDb()
		.getAllSync<{
			id: string;
			op_id: number;
			partition: string;
			path: string;
			mime: string;
			bytes: number;
			storage_id: string | null;
		}>("SELECT * FROM outbox_files WHERE op_id = ?", [opId])
		.map((r) => ({
			id: r.id,
			opId: r.op_id,
			partition: r.partition,
			path: r.path,
			mime: r.mime,
			bytes: r.bytes,
			storageId: r.storage_id ?? undefined,
		}));
}

export async function setFileStorageId(fileId: string, storageId: string): Promise<void> {
	await getDb().withExclusiveTransactionAsync(async (txn) => {
		await txn.runAsync("UPDATE outbox_files SET storage_id = ? WHERE id = ?", [storageId, fileId]);
	});
}

/** Deletes finished ops (and returns their file paths so the caller can remove them). */
export async function pruneOps(partition: string, syncedBefore: number, resolvedBefore: number): Promise<string[]> {
	const conn = getDb();
	const stale = conn.getAllSync<{ id: number }>(
		`SELECT id FROM outbox WHERE partition = ? AND
			((status = 'synced' AND synced_at < ?) OR (resolved_at IS NOT NULL AND resolved_at < ?))`,
		[partition, syncedBefore, resolvedBefore],
	);
	if (stale.length === 0) return [];
	const ids = stale.map((r) => r.id);
	const marks = ids.map(() => "?").join(",");
	const paths = conn
		.getAllSync<{ path: string }>(`SELECT path FROM outbox_files WHERE op_id IN (${marks})`, ids)
		.map((r) => r.path);
	await conn.withExclusiveTransactionAsync(async (txn) => {
		await txn.runAsync(`DELETE FROM outbox_files WHERE op_id IN (${marks})`, ids);
		await txn.runAsync(`DELETE FROM outbox WHERE id IN (${marks})`, ids);
	});
	return paths;
}

export function readCache(partition: string, key: string): CacheEntry | null {
	const row = getDb().getFirstSync<{ value: string; fetched_at: number }>(
		"SELECT value, fetched_at FROM query_cache WHERE partition = ? AND key = ?",
		[partition, key],
	);
	if (!row) return null;
	const value = parseJson<unknown>(row.value);
	return value === undefined ? null : { value, fetchedAt: row.fetched_at };
}

export async function writeCache(partition: string, key: string, value: unknown, fetchedAt: number): Promise<void> {
	await getDb().withExclusiveTransactionAsync(async (txn) => {
		await txn.runAsync(
			`INSERT INTO query_cache (partition, key, value, fetched_at) VALUES (?, ?, ?, ?)
			ON CONFLICT (partition, key) DO UPDATE SET value = excluded.value, fetched_at = excluded.fetched_at`,
			[partition, key, JSON.stringify(value), fetchedAt],
		);
		await txn.runAsync(
			`INSERT INTO partition_meta (partition, last_online_at) VALUES (?, ?)
			ON CONFLICT (partition) DO UPDATE SET last_online_at = MAX(last_online_at, excluded.last_online_at)`,
			[partition, fetchedAt],
		);
	});
}

export function lastOnlineAt(partition: string): number | null {
	const row = getDb().getFirstSync<{ last_online_at: number }>(
		"SELECT last_online_at FROM partition_meta WHERE partition = ?",
		[partition],
	);
	return row?.last_online_at ?? null;
}

export async function pruneCache(olderThan: number): Promise<void> {
	await getDb().withExclusiveTransactionAsync(async (txn) => {
		await txn.runAsync("DELETE FROM query_cache WHERE fetched_at < ?", [olderThan]);
	});
}

/** Removes every cached read and finished op for the partition; open ops are kept. */
export async function purgePartitionCache(partition: string): Promise<void> {
	await getDb().withExclusiveTransactionAsync(async (txn) => {
		await txn.runAsync("DELETE FROM query_cache WHERE partition = ?", [partition]);
		await txn.runAsync("DELETE FROM partition_meta WHERE partition = ?", [partition]);
	});
}

/** Deletes a partition's outbox entirely (explicit user discard on sign-out). */
export async function deletePartitionOutbox(partition: string): Promise<string[]> {
	const conn = getDb();
	const paths = conn
		.getAllSync<{ path: string }>("SELECT path FROM outbox_files WHERE partition = ?", [partition])
		.map((r) => r.path);
	await conn.withExclusiveTransactionAsync(async (txn) => {
		await txn.runAsync("DELETE FROM outbox_files WHERE partition = ?", [partition]);
		await txn.runAsync("DELETE FROM outbox WHERE partition = ?", [partition]);
	});
	return paths;
}
