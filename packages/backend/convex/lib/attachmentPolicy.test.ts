import { describe, expect, it } from "vitest";
import {
	attachmentExtension,
	isBlockedAttachmentFilename,
} from "./attachmentPolicy";

describe("attachmentExtension", () => {
	it("normalizes trailing spaces and periods before extracting the extension", () => {
		expect(attachmentExtension("payload.exe ")).toBe("exe");
		expect(attachmentExtension("payload.exe.")).toBe("exe");
		expect(isBlockedAttachmentFilename("payload.exe ")).toBe(true);
		expect(isBlockedAttachmentFilename("payload.exe.")).toBe(true);
	});
});
