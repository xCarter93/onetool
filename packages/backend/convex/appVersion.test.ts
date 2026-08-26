import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { convexTest } from "convex-test";
import { setupConvexTest } from "./test.setup";
import { api } from "./_generated/api";

const TEST_SECRET = "vercel_test_webhook_secret";

async function sign(body: string, secret: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-1" },
		false,
		["sign"]
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(body)
	);
	return Array.from(new Uint8Array(signature))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

function promotedEvent(url: string, sha?: string) {
	return JSON.stringify({
		type: "deployment.promoted",
		payload: {
			deployment: { url, meta: sha ? { githubCommitSha: sha } : {} },
		},
	});
}

async function post(
	t: ReturnType<typeof convexTest>,
	body: string,
	signature: string
) {
	return await t.fetch("/vercel-deploy-webhook", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-vercel-signature": signature,
		},
		body,
	});
}

describe("POST /vercel-deploy-webhook", () => {
	let t: ReturnType<typeof convexTest>;
	let originalSecret: string | undefined;

	beforeEach(() => {
		t = setupConvexTest();
		originalSecret = process.env.VERCEL_DEPLOY_WEBHOOK_SECRET;
		process.env.VERCEL_DEPLOY_WEBHOOK_SECRET = TEST_SECRET;
	});

	afterEach(() => {
		if (originalSecret === undefined) {
			delete process.env.VERCEL_DEPLOY_WEBHOOK_SECRET;
		} else {
			process.env.VERCEL_DEPLOY_WEBHOOK_SECRET = originalSecret;
		}
	});

	it("records the promoted deployment on a valid signature", async () => {
		const body = promotedEvent("onetool-abc123.vercel.app", "deadbeef");
		const res = await post(t, body, await sign(body, TEST_SECRET));
		expect(res.status).toBe(200);

		const version = await t.query(api.appVersion.get, {});
		expect(version).toEqual({ deploymentUrl: "onetool-abc123.vercel.app" });
	});

	it("strips a scheme from the payload URL before storing", async () => {
		const body = promotedEvent("https://onetool-abc123.vercel.app/");
		const res = await post(t, body, await sign(body, TEST_SECRET));
		expect(res.status).toBe(200);
		expect(await t.query(api.appVersion.get, {})).toEqual({
			deploymentUrl: "onetool-abc123.vercel.app",
		});
	});

	it("rejects a bad signature without recording", async () => {
		const body = promotedEvent("onetool-evil.vercel.app");
		const res = await post(t, body, await sign(body, "wrong-secret"));
		expect(res.status).toBe(403);
		expect(await t.query(api.appVersion.get, {})).toBeNull();
	});

	it("rejects a malformed signature header", async () => {
		const body = promotedEvent("onetool-evil.vercel.app");
		const res = await post(t, body, "not-hex");
		expect(res.status).toBe(403);
		expect(await t.query(api.appVersion.get, {})).toBeNull();
	});

	it("ignores unrelated event types with a 200", async () => {
		const body = JSON.stringify({
			type: "deployment.created",
			payload: { deployment: { url: "onetool-new.vercel.app" } },
		});
		const res = await post(t, body, await sign(body, TEST_SECRET));
		expect(res.status).toBe(200);
		expect(await t.query(api.appVersion.get, {})).toBeNull();
	});

	it("clears the singleton on rollback (payload carries only deployment IDs)", async () => {
		const first = promotedEvent("onetool-v2.vercel.app");
		await post(t, first, await sign(first, TEST_SECRET));

		// Documented deployment.rollback shape: no payload.deployment at all.
		const rollback = JSON.stringify({
			type: "deployment.rollback",
			payload: {
				project: { id: "prj_123" },
				fromDeploymentId: "dpl_new",
				toDeploymentId: "dpl_old",
			},
		});
		const res = await post(t, rollback, await sign(rollback, TEST_SECRET));
		expect(res.status).toBe(200);
		expect(await t.query(api.appVersion.get, {})).toBeNull();

		// Next promote records normally again.
		const next = promotedEvent("onetool-v3.vercel.app");
		await post(t, next, await sign(next, TEST_SECRET));
		expect(await t.query(api.appVersion.get, {})).toEqual({
			deploymentUrl: "onetool-v3.vercel.app",
		});
	});
});
