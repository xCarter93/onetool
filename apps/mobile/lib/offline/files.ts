import * as FileSystem from "expo-file-system/legacy";
import * as Crypto from "expo-crypto";

// Document storage survives low-disk purges; the cache directory does not.
const OUTBOX_DIR = `${FileSystem.documentDirectory}offline-outbox/`;

export type DurableFile = { id: string; path: string; mime: string; bytes: number };

async function ensureDir() {
	const info = await FileSystem.getInfoAsync(OUTBOX_DIR);
	if (!info.exists) await FileSystem.makeDirectoryAsync(OUTBOX_DIR, { intermediates: true });
}

async function sizeOf(path: string): Promise<number> {
	const info = await FileSystem.getInfoAsync(path);
	return info.exists && "size" in info ? info.size : 0;
}

export async function writeDurableText(text: string, mime: string, extension: string): Promise<DurableFile> {
	await ensureDir();
	const id = Crypto.randomUUID();
	const path = `${OUTBOX_DIR}${id}.${extension}`;
	await FileSystem.writeAsStringAsync(path, text);
	return { id, path, mime, bytes: await sizeOf(path) };
}

export async function copyToDurable(uri: string, mime: string, extension: string): Promise<DurableFile> {
	await ensureDir();
	const id = Crypto.randomUUID();
	const path = `${OUTBOX_DIR}${id}.${extension}`;
	await FileSystem.copyAsync({ from: uri, to: path });
	return { id, path, mime, bytes: await sizeOf(path) };
}

export async function deleteDurable(paths: string[]): Promise<void> {
	await Promise.all(paths.map((path) => FileSystem.deleteAsync(path, { idempotent: true })));
}

export async function durableExists(path: string): Promise<boolean> {
	return (await FileSystem.getInfoAsync(path)).exists;
}

/** POSTs the file body to a Convex upload URL and returns the storage id. */
export async function uploadDurable(uploadUrl: string, path: string, mime: string): Promise<string> {
	const result = await FileSystem.uploadAsync(uploadUrl, path, {
		httpMethod: "POST",
		uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
		headers: { "Content-Type": mime },
	});
	if (result.status < 200 || result.status >= 300) {
		throw new Error(`Upload failed (HTTP ${result.status})`);
	}
	return (JSON.parse(result.body) as { storageId: string }).storageId;
}
