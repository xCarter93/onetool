import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { api } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import { createTestOrg, createTestIdentity } from "./test.helpers";

/** Reference HMAC-SHA256 hex, computed independently of the implementation. */
async function hmacHex(secret: string, message: string): Promise<string> {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"]
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		encoder.encode(message)
	);
	return Array.from(new Uint8Array(signature))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

describe("support.getConversationsIdentity", () => {
	let t: ReturnType<typeof setupConvexTest>;
	const originalSecret = process.env.POSTHOG_SECRET_API_TOKEN;

	beforeEach(() => {
		t = setupConvexTest();
	});

	afterEach(() => {
		if (originalSecret === undefined) {
			delete process.env.POSTHOG_SECRET_API_TOKEN;
		} else {
			process.env.POSTHOG_SECRET_API_TOKEN = originalSecret;
		}
	});

	async function setup() {
		const org = await t.run(async (ctx) => createTestOrg(ctx, {}));
		const asUser = t.withIdentity(
			createTestIdentity(org.clerkUserId, org.clerkOrgId)
		);
		return { ...org, asUser };
	}

	it("returns the Clerk user id with its HMAC-SHA256 hex hash", async () => {
		process.env.POSTHOG_SECRET_API_TOKEN = "phs_test_secret";
		const { asUser, clerkUserId } = await setup();

		const identity = await asUser.query(
			api.support.getConversationsIdentity,
			{}
		);
		expect(identity).not.toBeNull();
		expect(identity!.distinctId).toBe(clerkUserId);
		expect(identity!.hash).toBe(
			await hmacHex("phs_test_secret", clerkUserId)
		);
	});

	it("returns null when the secret env var is unset", async () => {
		delete process.env.POSTHOG_SECRET_API_TOKEN;
		const { asUser } = await setup();

		const identity = await asUser.query(
			api.support.getConversationsIdentity,
			{}
		);
		expect(identity).toBeNull();
	});
});
