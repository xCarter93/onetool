import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import { assistantTools, isAllowedWorkspacePath } from "./assistantTools";

describe("isAllowedWorkspacePath", () => {
	it("accepts workspace list and detail paths", () => {
		expect(isAllowedWorkspacePath("/home")).toBe(true);
		expect(isAllowedWorkspacePath("/clients")).toBe(true);
		expect(isAllowedWorkspacePath("/clients/import")).toBe(true);
		expect(isAllowedWorkspacePath("/clients/jd7abc123XYZ_-")).toBe(true);
		expect(isAllowedWorkspacePath("/projects/jd7abc123")).toBe(true);
		expect(isAllowedWorkspacePath("/quotes/jd7abc123")).toBe(true);
		expect(isAllowedWorkspacePath("/invoices/jd7abc123")).toBe(true);
		expect(isAllowedWorkspacePath("/tasks")).toBe(true);
		expect(isAllowedWorkspacePath("/reports/new")).toBe(true);
		expect(isAllowedWorkspacePath("/organization/profile")).toBe(true);
	});

	// Client/project/quote creation moved into dialogs; the routes are gone. The
	// id patterns would otherwise still match "new" and route the user to a 404.
	it("rejects the retired /new creation routes", () => {
		expect(isAllowedWorkspacePath("/clients/new")).toBe(false);
		expect(isAllowedWorkspacePath("/projects/new")).toBe(false);
		expect(isAllowedWorkspacePath("/quotes/new")).toBe(false);
	});

	it("rejects external, malformed, and unlisted paths", () => {
		expect(isAllowedWorkspacePath("https://evil.example")).toBe(false);
		expect(isAllowedWorkspacePath("//evil.example")).toBe(false);
		expect(isAllowedWorkspacePath("/admin")).toBe(false);
		expect(isAllowedWorkspacePath("/organization/complete")).toBe(false);
		expect(isAllowedWorkspacePath("/clients/../admin")).toBe(false);
		expect(isAllowedWorkspacePath("/clients/id/extra")).toBe(false);
		expect(isAllowedWorkspacePath("clients")).toBe(false);
		expect(isAllowedWorkspacePath("/clients?x=1")).toBe(false);
		expect(isAllowedWorkspacePath("")).toBe(false);
	});
});

// @convex-dev/agent injects ctx by spreading {...tool, ctx} (wrapTools) and the
// AI SDK calls execute as a method, so the handler reads ctx off `this`. The
// withPermissionFallback wrapper must forward `this` — calling the original
// execute bare loses it and every tool throws
// "Cannot read properties of undefined (reading 'ctx')".
describe("assistantTools permission-fallback wrapper", () => {
	function invokeAsAgentRuntime(
		tool: unknown,
		ctx: unknown,
		input: unknown
	): Promise<unknown> {
		const injected: Record<string, unknown> = {
			...(tool as Record<string, unknown>),
			ctx,
		};
		const execute = injected.execute as (
			this: unknown,
			...args: unknown[]
		) => Promise<unknown>;
		return execute.call(injected, input, {
			toolCallId: "call_1",
			messages: [],
		});
	}

	it("forwards the runtime-injected ctx to the tool handler", async () => {
		const stats = { activeClients: 7 };
		const ctx = { runQuery: async () => stats };
		await expect(
			invokeAsAgentRuntime(assistantTools.getBusinessStats, ctx, {})
		).resolves.toEqual(stats);
	});

	it("converts FORBIDDEN ConvexErrors into a structured no_permission result", async () => {
		const ctx = {
			runQuery: async () => {
				throw new ConvexError({ code: "FORBIDDEN", object: "clients" });
			},
		};
		await expect(
			invokeAsAgentRuntime(assistantTools.getBusinessStats, ctx, {})
		).resolves.toMatchObject({
			error: "no_permission",
			object: "clients",
		});
	});

	it("rethrows non-permission errors", async () => {
		const ctx = {
			runQuery: async () => {
				throw new Error("boom");
			},
		};
		await expect(
			invokeAsAgentRuntime(assistantTools.getBusinessStats, ctx, {})
		).rejects.toThrow("boom");
	});
});
