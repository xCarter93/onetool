// Plan 13-03: Portal OTP email sender (PORTAL-01).
// Internal action so only the portal OTP flow (via scheduler) can dispatch
// these messages. Imports the React-Email template that lives co-located in
// this package (Plan 01 Wave 0) so no workspace alias is needed.
import { internalAction, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { render } from "@react-email/render";
import { resend } from "../resend";
import { PortalOtpEmail } from "../emails/portalOtp";
import { internal } from "../_generated/api";

// TODO(ops): verify DNS in Resend dashboard for onetool.biz before phase ships.
// Locked per CONTEXT — sender is OneTool, not the business name.
const FROM_ADDRESS = "OneTool <noreply@onetool.biz>";
const EXPIRES_MINUTES = 10;

/**
 * Internal helper query so the action can read org name without running a
 * full mutation context.
 */
export const _lookupOrgName = internalQuery({
	args: { orgId: v.id("organizations") },
	handler: async (ctx, { orgId }) => {
		const org = await ctx.db.get(orgId);
		return org ? { name: org.name } : null;
	},
});

/**
 * Sends a portal OTP email via Resend. Scheduled by `requestOtp` in
 * `portal/otp.ts` after the OTP row is committed.
 */
export const sendPortalOtpEmail = internalAction({
	args: {
		to: v.string(),
		code: v.string(),
		orgId: v.id("organizations"),
	},
	handler: async (ctx, { to, code, orgId }) => {
		const org = await ctx.runQuery(internal.portal.email._lookupOrgName, {
			orgId,
		});
		const businessName = org?.name ?? "your provider";

		const html = await render(
			PortalOtpEmail({
				code,
				businessName,
				expiresInMinutes: EXPIRES_MINUTES,
			})
		);

		// [Review fix WR-05] In test runs the Resend component isn't
		// registered (see test.setup.ts), so calling resend.sendEmail would
		// attempt writes against a non-existent component table. Skip the
		// dispatch when the canonical test signal RESEND_API_KEY ===
		// "test-key" is set, BUT only when we're actually running under a
		// known test runner. This guards against a developer accidentally
		// pasting RESEND_API_KEY=test-key into a staging .env and silently
		// disabling all portal OTP delivery (logs would just show
		// {ok:true, skipped:"test"}, easy to miss in incident review).
		const isTestEnv =
			process.env.NODE_ENV === "test" || process.env.VITEST === "true";
		if (process.env.RESEND_API_KEY === "test-key") {
			if (!isTestEnv) {
				throw new Error(
					"RESEND_API_KEY is set to 'test-key' outside a test runner — " +
						"refusing to silently drop portal OTP emails. Set a real key " +
						"or unset RESEND_API_KEY in this environment."
				);
			}
			return { ok: true, skipped: "test" as const };
		}

		await resend.sendEmail(ctx, {
			from: FROM_ADDRESS,
			to,
			subject: `Your ${businessName} sign-in code: ${code}`,
			html,
		});

		return { ok: true };
	},
});
