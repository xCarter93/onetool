import { describe, expect, it, vi } from "vitest";

import { runWithLoadingToast } from "./loading-toast";

describe("runWithLoadingToast", () => {
	it("dismisses a persistent loading toast when PDF generation fails", async () => {
		const toast = {
			loading: vi.fn(() => "pdf-loading"),
			removeToast: vi.fn(),
		};

		await expect(
			runWithLoadingToast(toast, "Generating agreement PDF", "Rendering…", async () => {
				throw new Error("PDF action failed");
			})
		).rejects.toThrow("PDF action failed");

		expect(toast.removeToast).toHaveBeenCalledWith("pdf-loading");
	});
});
