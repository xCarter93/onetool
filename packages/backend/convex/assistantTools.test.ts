import { describe, expect, it } from "vitest";
import { isAllowedWorkspacePath } from "./assistantTools";

describe("isAllowedWorkspacePath", () => {
	it("accepts workspace list and detail paths", () => {
		expect(isAllowedWorkspacePath("/home")).toBe(true);
		expect(isAllowedWorkspacePath("/clients")).toBe(true);
		expect(isAllowedWorkspacePath("/clients/new")).toBe(true);
		expect(isAllowedWorkspacePath("/clients/jd7abc123XYZ_-")).toBe(true);
		expect(isAllowedWorkspacePath("/projects/jd7abc123")).toBe(true);
		expect(isAllowedWorkspacePath("/quotes/jd7abc123")).toBe(true);
		expect(isAllowedWorkspacePath("/invoices/jd7abc123")).toBe(true);
		expect(isAllowedWorkspacePath("/tasks")).toBe(true);
		expect(isAllowedWorkspacePath("/reports/new")).toBe(true);
		expect(isAllowedWorkspacePath("/organization/profile")).toBe(true);
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
