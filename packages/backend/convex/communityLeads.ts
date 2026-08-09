import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { userMutation, userQuery } from "./lib/factories";
import { createClient } from "./clients";

/**
 * Community leads — quote requests captured by the public community page.
 *
 * Rows are written by `communityPages.submitInterest` (public, unauthenticated).
 * Everything here is the admin side: reading the inbox, moving a lead along the
 * status ladder, and the explicit promotion to a client record. A request never
 * becomes a client on its own — that is a deliberate decision, not a default.
 */

const leadStatus = v.union(
	v.literal("new"),
	v.literal("contacted"),
	v.literal("quoted"),
	v.literal("converted"),
	v.literal("archived")
);

/** Beyond this the inbox stops counting exactly and reports "N+". */
const COUNT_CEILING = 500;
const PAGE_SIZE = 100;

type CommunityLead = Doc<"communityLeads">;

/**
 * The request inbox. One subscription carries both the filtered list and the
 * counts the header needs, so the two can never disagree mid-render.
 */
export const list = userQuery({
	args: { status: v.optional(leadStatus) },
	handler: async (
		ctx,
		args
	): Promise<{
		leads: CommunityLead[];
		newCount: number;
		total: number;
		totalIsCapped: boolean;
	}> => {
		await ctx.requireLevel("community", "view");

		const recent = await ctx.db
			.query("communityLeads")
			.withIndex("by_org", (q) => q.eq("orgId", ctx.orgId))
			.order("desc")
			.take(COUNT_CEILING + 1);

		const totalIsCapped = recent.length > COUNT_CEILING;
		const counted = totalIsCapped ? recent.slice(0, COUNT_CEILING) : recent;
		const filtered = args.status
			? counted.filter((lead) => lead.status === args.status)
			: counted;

		return {
			leads: filtered.slice(0, PAGE_SIZE),
			newCount: counted.filter((lead) => lead.status === "new").length,
			total: counted.length,
			totalIsCapped,
		};
	},
});

export const updateStatus = userMutation({
	args: { leadId: v.id("communityLeads"), status: leadStatus },
	handler: async (ctx, args): Promise<null> => {
		await ctx.requireLevel("community", "modify");
		const lead = await ctx.orgEntity("communityLeads", args.leadId);
		const now = Date.now();
		await ctx.db.patch(args.leadId, {
			status: args.status,
			statusUpdatedAt: now,
			// Stamped once, on the first move off "new" — that is the moment the
			// request was actually picked up.
			...(!lead.firstRespondedAt && args.status !== "new"
				? { firstRespondedAt: now }
				: {}),
		});
		return null;
	},
});

/**
 * "Add as client" — the explicit promotion. Creates a real client (with the
 * portal id, activity entry, and automations every other client gets) plus a
 * primary contact carrying the requester's email and phone, then links the two.
 * Idempotent: a lead that already has a client returns it untouched.
 */
export const promoteToClient = userMutation({
	args: { leadId: v.id("communityLeads") },
	handler: async (ctx, args): Promise<Id<"clients">> => {
		await ctx.requireLevel("community", "modify");
		const lead = await ctx.orgEntity("communityLeads", args.leadId);

		if (lead.clientId) return lead.clientId;

		// createClient checks `clients: modify` itself.
		const clientId = await createClient(
			ctx,
			{
				companyName: lead.name,
				status: "lead" as const,
				leadSource: "community-page" as const,
				isActive: true,
				notes: buildClientNotes(lead),
			},
			"communityLeads.promoteToClient"
		);

		const [firstName, ...rest] = lead.name.trim().split(/\s+/);
		await ctx.db.insert("clientContacts", {
			clientId,
			orgId: ctx.orgId,
			firstName: firstName || lead.name,
			lastName: rest.join(" "),
			email: lead.email,
			phone: lead.phone,
			isPrimary: true,
		});

		const promotedAt = Date.now();
		await ctx.db.patch(args.leadId, {
			clientId,
			status: "converted",
			statusUpdatedAt: promotedAt,
			...(lead.firstRespondedAt ? {} : { firstRespondedAt: promotedAt }),
		});

		return clientId;
	},
});

/** Records where the client came from, since the lead row is not linked from the client. */
function buildClientNotes(lead: CommunityLead): string {
	const parts = [`Added from a community page request (${lead.slug}).`];
	if (lead.service) parts.push(`Service: ${lead.service}`);
	if (lead.message) parts.push(`\n"${lead.message}"`);
	return parts.join("\n");
}
