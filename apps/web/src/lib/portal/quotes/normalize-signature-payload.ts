import { z } from "zod";

/**
 * Plan 14-04 owns this file (REVIEWS finding #1).
 * Frontend SignaturePayload contract lives in components/portal/quotes/signature-card.tsx.
 * This module is the route-side zod schemas + types for /api/portal/quotes/[id]/{approve,decline}.
 */

export const approveBodySchema = z.object({
	expectedDocumentId: z.string().min(1),
	signatureMode: z.enum(["typed", "drawn"]),
	signatureBase64: z
		.string()
		.regex(/^data:image\/png;base64,/, "PNG required")
		// Backend strips the 22-char `data:image/png;base64,` prefix and rejects
		// decoded payloads > 256_000 bytes. Tightest schema cap that still
		// accepts every payload the backend accepts: 22 + ceil(256_000/3)*4 =
		// 341_358. Anything longer is guaranteed to fail SIGNATURE_TOO_LARGE,
		// so reject at the route boundary instead of round-tripping to Convex.
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
