import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { classifyError, OfflineTimeoutError } from "./errors";

describe("classifyError — ConvexError object data", () => {
	it("classifies UNAUTHENTICATED as auth", () => {
		expect(classifyError(new ConvexError({ code: "UNAUTHENTICATED" })).class).toBe("auth");
	});

	it("classifies FORBIDDEN with scope true as conflict", () => {
		expect(classifyError(new ConvexError({ code: "FORBIDDEN", scope: true })).class).toBe("conflict");
	});

	it("classifies plain FORBIDDEN as permission", () => {
		expect(classifyError(new ConvexError({ code: "FORBIDDEN" })).class).toBe("permission");
	});

	it("classifies CONFLICT with TASK_ALREADY_COMPLETED as already_applied", () => {
		const out = classifyError(new ConvexError({ code: "CONFLICT", reason: "TASK_ALREADY_COMPLETED" }));
		expect(out.class).toBe("already_applied");
	});

	it.each(["CONFLICT", "QUOTE_VERSION_STALE", "QUOTE_NOT_PENDING", "RECURRING_PROJECT_SUSPENDED", "PENDING_REVISION_REPLACE"])(
		"classifies %s as conflict",
		(code) => {
			expect(classifyError(new ConvexError({ code })).class).toBe("conflict");
		}
	);

	it("classifies RATE_LIMITED as temporary", () => {
		expect(classifyError(new ConvexError({ code: "RATE_LIMITED" })).class).toBe("temporary");
	});

	it.each(["BAD_REQUEST", "INVALID_INPUT", "NOT_FOUND", "PLAN_LIMIT_REACHED", "IDEMPOTENCY_KEY_REUSED", "SOMETHING_UNKNOWN"])(
		"classifies %s as permanent",
		(code) => {
			expect(classifyError(new ConvexError({ code })).class).toBe("permanent");
		}
	);

	it("uses data.message when present", () => {
		const out = classifyError(new ConvexError({ code: "FORBIDDEN", message: "No dice" }));
		expect(out.message).toBe("No dice");
	});

	it("falls back to a default message when data.message is missing or not a string", () => {
		const out = classifyError(new ConvexError({ code: "FORBIDDEN", message: 42 as unknown as string }));
		expect(out.message).toBeTruthy();
		expect(out.message).not.toBe(42);
	});

	it("carries code and reason through", () => {
		const out = classifyError(new ConvexError({ code: "CONFLICT", reason: "QUOTE_STALE" }));
		expect(out.code).toBe("CONFLICT");
		expect(out.reason).toBe("QUOTE_STALE");
	});
});

describe("classifyError — ConvexError string data", () => {
	it("classifies as permanent using the string as the message", () => {
		const out = classifyError(new ConvexError("bad request"));
		expect(out.class).toBe("permanent");
		expect(out.message).toBe("bad request");
	});
});

describe("classifyError — OfflineTimeoutError", () => {
	it("classifies as temporary", () => {
		expect(classifyError(new OfflineTimeoutError("timed out")).class).toBe("temporary");
	});
});

describe("classifyError — plain Error heuristics", () => {
	it.each(["Network request failed", "Connection lost", "network error", "fetch failed", "Request timed out"])(
		"classifies %s as temporary",
		(message) => {
			expect(classifyError(new Error(message)).class).toBe("temporary");
		}
	);

	it.each(["Unauthenticated", "not authenticated", "No auth token"])("classifies %s as auth", (message) => {
		expect(classifyError(new Error(message)).class).toBe("auth");
	});

	it.each(["[CONVEX A(foo:bar)] Server Error", "Server Error", "Uncaught ReferenceError: x"])(
		"classifies %s as permanent with a generic message",
		(message) => {
			const out = classifyError(new Error(message));
			expect(out.class).toBe("permanent");
			expect(out.message).not.toBe(message);
			expect(out.message).toBeTruthy();
		}
	);

	it("classifies an unrecognized message as temporary", () => {
		expect(classifyError(new Error("something odd happened")).class).toBe("temporary");
	});
});

describe("classifyError — non-Error values", () => {
	it.each([null, undefined, "a string", 42, { some: "object" }])("classifies %j as temporary", (value) => {
		expect(classifyError(value).class).toBe("temporary");
	});
});
