import { describe, it, expect, afterEach, vi } from "vitest";
import { encryptToken, decryptToken } from "./quickbooksCrypto";

// base64 of a fixed 32-byte key.
const KEY = btoa("0123456789abcdef0123456789abcdef");

describe("quickbooksCrypto", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("round-trips a token through AES-GCM with the key set", async () => {
		vi.stubEnv("QUICKBOOKS_TOKEN_ENC_KEY", KEY);
		const stored = await encryptToken("refresh_secret_1");
		expect(stored).toMatch(/^qbenc1:/);
		expect(stored).not.toContain("refresh_secret_1");
		expect(await decryptToken(stored)).toBe("refresh_secret_1");
	});

	it("produces distinct ciphertexts per call (random IV)", async () => {
		vi.stubEnv("QUICKBOOKS_TOKEN_ENC_KEY", KEY);
		const first = await encryptToken("same_token");
		const second = await encryptToken("same_token");
		expect(first).not.toBe(second);
		expect(await decryptToken(first)).toBe("same_token");
		expect(await decryptToken(second)).toBe("same_token");
	});

	it("passes legacy plaintext through decryptToken unchanged", async () => {
		vi.stubEnv("QUICKBOOKS_TOKEN_ENC_KEY", KEY);
		expect(await decryptToken("legacy_plaintext_token")).toBe(
			"legacy_plaintext_token"
		);
		expect(await decryptToken("")).toBe("");
	});

	it("stores plaintext when no key is configured", async () => {
		// Explicit empty value: don't depend on the ambient env being unset.
		vi.stubEnv("QUICKBOOKS_TOKEN_ENC_KEY", "");
		expect(await encryptToken("token_without_key")).toBe("token_without_key");
	});

	it("throws when an encrypted value exists but the key is missing", async () => {
		vi.stubEnv("QUICKBOOKS_TOKEN_ENC_KEY", KEY);
		const stored = await encryptToken("secret");
		vi.stubEnv("QUICKBOOKS_TOKEN_ENC_KEY", "");
		await expect(decryptToken(stored)).rejects.toThrow(
			/QUICKBOOKS_TOKEN_ENC_KEY is not set/
		);
	});

	it("rejects a key that is not 32 bytes", async () => {
		vi.stubEnv("QUICKBOOKS_TOKEN_ENC_KEY", btoa("short-key"));
		await expect(encryptToken("secret")).rejects.toThrow(/32 bytes/);
	});

	it("rejects tampered ciphertext (GCM auth)", async () => {
		vi.stubEnv("QUICKBOOKS_TOKEN_ENC_KEY", KEY);
		const stored = await encryptToken("secret");
		const [prefix, iv, ct] = [
			stored.slice(0, 7),
			stored.slice(7).split(":")[0],
			stored.slice(7).split(":")[1],
		];
		// Re-encode the ciphertext with its first byte flipped.
		const bytes = Uint8Array.from(atob(ct), (c) => c.charCodeAt(0));
		bytes[0] ^= 0xff;
		const tampered = `${prefix}${iv}:${btoa(String.fromCharCode(...bytes))}`;
		await expect(decryptToken(tampered)).rejects.toThrow();
	});
});
