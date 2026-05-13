// Phase 15 stubs — Plan 02 implements list/get/getDownloadUrl; Plan 03 adds the V8-runtime helper queries _getPortalSessionForAction / _rateLimitPreflight / _getPaymentTargetInternal. The Stripe-importing action createPaymentIntent lives in portal/invoicesActions.ts.
import { query } from "../_generated/server";
import { ConvexError, v } from "convex/values";

export const list = query({
	args: {},
	handler: async () => {
		throw new ConvexError({ code: "NOT_IMPLEMENTED" });
	},
});

export const get = query({
	args: { invoiceId: v.id("invoices") },
	handler: async () => {
		throw new ConvexError({ code: "NOT_IMPLEMENTED" });
	},
});

export const getDownloadUrl = query({
	args: { invoiceId: v.id("invoices") },
	handler: async () => {
		throw new ConvexError({ code: "NOT_IMPLEMENTED" });
	},
});
