import { z } from "zod";

export const approveBodySchema = z.object({
	expectedDocumentId: z.string().min(1),
	signatureMode: z.enum(["typed", "drawn"]),
	signatureBase64: z
		.string()
		.regex(/^data:image\/png;base64,/, "PNG required")
		// Matches the backend's 256 KB decoded PNG cap after base64 expansion.
		.max(341_358),
	signatureRawData: z.string().max(200_000),
	termsAccepted: z.literal(true),
	intentAffirmed: z.boolean().optional(),
});
export type ApproveBody = z.infer<typeof approveBodySchema>;

export const declineBodySchema = z.object({
	expectedDocumentId: z.string().min(1),
	declineReason: z.string().max(2000).optional(),
});
export type DeclineBody = z.infer<typeof declineBodySchema>;
