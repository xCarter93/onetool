import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";

import { emailSendErrorMessage } from "./send-error";

describe("emailSendErrorMessage", () => {
	it("returns only a nonblank ConvexError data message", () => {
		expect(
			emailSendErrorMessage(
				new ConvexError({ code: "RECIPIENT_SUPPRESSED", message: "Use another address." }),
				"Please try again."
			)
		).toBe("Use another address.");

		expect(
			emailSendErrorMessage(new Error("Internal detail"), "Please try again.")
		).toBe("Please try again.");
		expect(
			emailSendErrorMessage(
				new ConvexError({ code: "UNKNOWN", message: " " }),
				"Please try again."
			)
		).toBe("Please try again.");
		expect(
			emailSendErrorMessage(
				new ConvexError({ code: "UNKNOWN", message: 123 }),
				"Please try again."
			)
		).toBe("Please try again.");
		expect(emailSendErrorMessage(null, "Please try again.")).toBe(
			"Please try again."
		);
	});
});
