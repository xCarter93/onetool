/**
 * Application-level encryption for stored QuickBooks OAuth tokens (Intuit
 * security requirement: refresh tokens must be AES-encrypted with the key held
 * in configuration, separate from the data store).
 *
 * Key: `QUICKBOOKS_TOKEN_ENC_KEY`, base64-encoded 32 bytes (AES-256-GCM).
 * Ciphertext format: `qbenc1:<iv>:<ciphertext+tag>` (both base64).
 *
 * Values without the prefix are treated as legacy plaintext and pass through
 * decryptToken unchanged; they get encrypted on the next token rotation, so a
 * pre-existing connection migrates lazily within one refresh cycle. When the
 * key is unset (tests, fresh dev setups) tokens are stored as-is — production
 * compliance requires the key to be set.
 *
 * Web Crypto on purpose: runs in the Convex Node runtime, the default
 * runtime, and edge-runtime tests alike. Only actions should encrypt/decrypt;
 * mutations compare stored strings opaquely and must never need to.
 */

const PREFIX = "qbenc1:";
const IV_BYTES = 12;

let warnedMissingKey = false;

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
	const binary = atob(value);
	const bytes = new Uint8Array(new ArrayBuffer(binary.length));
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

function toBase64(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

async function loadKey(): Promise<CryptoKey | null> {
	const raw = process.env.QUICKBOOKS_TOKEN_ENC_KEY;
	if (!raw) return null;
	const keyBytes = fromBase64(raw);
	if (keyBytes.length !== 32) {
		throw new Error(
			"QUICKBOOKS_TOKEN_ENC_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)"
		);
	}
	return crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, [
		"encrypt",
		"decrypt",
	]);
}

export async function encryptToken(plaintext: string): Promise<string> {
	if (plaintext === "") return plaintext;
	const key = await loadKey();
	if (!key) {
		if (!warnedMissingKey) {
			warnedMissingKey = true;
			console.warn(
				"QUICKBOOKS_TOKEN_ENC_KEY is not set; QuickBooks tokens are stored unencrypted"
			);
		}
		return plaintext;
	}
	const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
	const ciphertext = new Uint8Array(
		await crypto.subtle.encrypt(
			{ name: "AES-GCM", iv },
			key,
			new TextEncoder().encode(plaintext)
		)
	);
	return `${PREFIX}${toBase64(iv)}:${toBase64(ciphertext)}`;
}

export async function decryptToken(stored: string): Promise<string> {
	if (!stored.startsWith(PREFIX)) return stored;
	const key = await loadKey();
	if (!key) {
		throw new Error(
			"Stored QuickBooks tokens are encrypted but QUICKBOOKS_TOKEN_ENC_KEY is not set"
		);
	}
	const [ivB64, ctB64] = stored.slice(PREFIX.length).split(":");
	if (!ivB64 || !ctB64) {
		throw new Error("Malformed encrypted QuickBooks token");
	}
	const plaintext = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv: fromBase64(ivB64) },
		key,
		fromBase64(ctB64)
	);
	return new TextDecoder().decode(plaintext);
}
