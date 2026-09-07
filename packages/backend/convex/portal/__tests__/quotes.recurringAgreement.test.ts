// Portal change framing: a revised agreement must compare against the revision the
// customer actually agreed to, and an override must point back at its standing agreement.
import { convexTest } from "convex-test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { setupConvexTest } from "../../test.setup";
import {
	createTestClient,
	createTestIdentity,
	createTestOrg,
	createTestProject,
} from "../../test.helpers";

const PORTAL_ISSUER = "https://portal.example.com";

beforeAll(() => {
	process.env.PORTAL_JWT_ISSUER = PORTAL_ISSUER;
});

type RevisionSpec = {
	revisionNumber: number;
	total: number;
	status: Doc<"projectSeriesAgreementRevisions">["status"];
	withdrawnAt?: number;
	clientId?: Id<"clients">;
};

describe("portal recurring agreement metadata", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	async function seed() {
		const { org, clientId, otherClientId } = await t.run(async (ctx) => {
			const created = await createTestOrg(ctx);
			return {
				org: created,
				clientId: await createTestClient(ctx, created.orgId),
				otherClientId: await createTestClient(ctx, created.orgId, {
					companyName: "Other Client",
				}),
			};
		});
		const asOwner = t.withIdentity(
			createTestIdentity(org.clerkUserId, org.clerkOrgId)
		);
		const portalId = "portal-uuid-agreements";
		const clientContactId = await t.run(async (ctx) => {
			await ctx.db.patch(clientId, { portalAccessId: portalId });
			return await ctx.db.insert("clientContacts", {
				clientId,
				orgId: org.orgId,
				firstName: "Pat",
				lastName: "Customer",
				email: "pat@example.com",
				isPrimary: true,
			});
		});
		const jti = "jti-agreements-1";
		await t.run(async (ctx) => {
			await ctx.db.insert("portalSessions", {
				orgId: org.orgId,
				clientId,
				clientContactId,
				clientPortalId: portalId,
				tokenJti: jti,
				createdAt: Date.now(),
				lastActivityAt: Date.now(),
				expiresAt: Date.now() + 60 * 60 * 1000,
			});
		});
		const asClient = t.withIdentity({
			issuer: PORTAL_ISSUER,
			subject: clientContactId,
			aud: "convex-portal",
			jti,
			orgId: org.orgId,
			clientContactId,
			clientPortalId: portalId,
		} as unknown as Parameters<typeof t.withIdentity>[0]);

		const projectId = await t.run((ctx) =>
			createTestProject(ctx, org.orgId, clientId, { projectType: "recurring" })
		);
		const seriesId = await t.run((ctx) =>
			ctx.db.insert("projectSeries", {
				orgId: org.orgId,
				originatingProjectId: projectId,
				clientId,
				title: "Weekly grounds care",
				createdByUserId: org.userId,
				anchorDateKey: "2026-09-07",
				timezone: "America/New_York",
				rule: { frequency: "weekly", interval: 1, weekdays: [1] },
				state: "active",
			})
		);

		async function sentQuote(total: number, ownerClientId = clientId) {
			const quoteId = await asOwner.mutation(api.quotes.create, {
				clientId: ownerClientId,
				status: "draft",
				subtotal: 0,
				total: 0,
				title: "Weekly grounds care",
			});
			await asOwner.mutation(api.quoteLineItems.create, {
				quoteId,
				description: "Visit",
				quantity: 1,
				unit: "each",
				rate: total,
				sortOrder: 0,
			});
			await t.run((ctx) => ctx.db.patch(quoteId, { status: "sent", sentAt: Date.now() }));
			return quoteId;
		}

		async function revision(spec: RevisionSpec) {
			const termsClientId = spec.clientId ?? clientId;
			const quoteId = await sentQuote(spec.total, termsClientId);
			return await t.run(async (ctx) => {
				const quoteVersionId = await ctx.db.insert("projectSeriesQuoteVersions", {
					orgId: org.orgId,
					seriesId,
					sourceQuoteId: quoteId,
					capturedFromQuoteId: quoteId,
					clientId: termsClientId,
					createdByUserId: org.userId,
					version: spec.revisionNumber,
					lineItems: [],
				});
				const templateId = await ctx.db.insert("projectSeriesQuoteTemplates", {
					orgId: org.orgId,
					seriesId,
					sourceQuoteId: quoteId,
					sourceNominalDate: "2026-09-07",
					versionId: quoteVersionId,
					version: spec.revisionNumber,
					active: true,
				});
				const revisionId = await ctx.db.insert("projectSeriesAgreementRevisions", {
					orgId: org.orgId,
					seriesId,
					revisionNumber: spec.revisionNumber,
					sourceQuoteId: quoteId,
					templateId,
					quoteVersionId,
					status: spec.status,
					withdrawnAt: spec.withdrawnAt,
					approvalCycle: 0,
					createdByUserId: org.userId,
					createdAt: Date.now(),
				});
				const terms = {
					schemaVersion: 1 as const,
					revisionId,
					seriesId,
					revisionNumber: spec.revisionNumber,
					agreementReference: `Q-${spec.revisionNumber}`,
					client: { id: termsClientId, name: "Client" },
					scope: { title: "Weekly grounds care" },
					schedule: {
						rule: { frequency: "weekly" as const, interval: 1, weekdays: [1] },
						anchorDateKey: "2026-09-07",
						timezone: "America/New_York",
					},
					billingMode: "per_visit" as const,
					paymentRule: {
						type: "percentage" as const,
						installments: [{ percentage: 100, dayOffset: spec.revisionNumber * 10 }],
					},
				};
				await ctx.db.patch(revisionId, { terms });
				await ctx.db.patch(quoteId, {
					recurringAgreementTerms: terms,
					recurringAgreementRevisionId: revisionId,
				});
				return { quoteId, revisionId, terms };
			});
		}

		return { asClient, clientId, otherClientId, projectId, seriesId, sentQuote, revision };
	}

	it("compares a revision against the newest agreed revision, skipping withdrawn ones", async () => {
		const { asClient, revision } = await seed();
		await revision({ revisionNumber: 1, total: 125, status: "superseded" });
		await revision({ revisionNumber: 2, total: 140, status: "superseded", withdrawnAt: Date.now() });
		const current = await revision({ revisionNumber: 3, total: 150, status: "pending" });

		const detail = await asClient.query(api.portal.quotes.get, { quoteId: current.quoteId });
		expect(detail.recurringAgreement?.isAgreement).toBe(true);
		expect(detail.recurringAgreement?.revisionNumber).toBe(3);
		expect(detail.recurringAgreement?.previousRevision).toMatchObject({
			revisionNumber: 1,
			perVisitTotal: 125,
			paymentRule: { installments: [{ percentage: 100, dayOffset: 10 }] },
		});
	});

	it("withholds the prior revision when its terms belong to another client", async () => {
		const { asClient, otherClientId, revision } = await seed();
		await revision({ revisionNumber: 1, total: 125, status: "approved", clientId: otherClientId });
		const current = await revision({ revisionNumber: 2, total: 150, status: "pending" });

		const detail = await asClient.query(api.portal.quotes.get, { quoteId: current.quoteId });
		expect(detail.recurringAgreement?.previousRevision).toBeNull();
	});

	it("frames an override with its standing agreement price and a visible back-link", async () => {
		const { asClient, projectId, seriesId, sentQuote, revision } = await seed();
		const active = await revision({ revisionNumber: 1, total: 125, status: "approved" });
		const overrideId = await sentQuote(160);
		await t.run(async (ctx) => {
			await ctx.db.patch(projectId, { recurringSeriesId: seriesId, startDate: Date.UTC(2026, 8, 14) });
			await ctx.db.patch(overrideId, {
				projectId,
				recurringAgreementTerms: active.terms,
				recurringAgreementRevisionId: active.revisionId,
				recurringQuoteOverride: true,
			});
		});

		const rows = await asClient.query(api.portal.quotes.list, {});
		const row = rows.find((candidate) => candidate._id === overrideId);
		expect(row?.recurringAgreement).toMatchObject({
			visitOverride: true,
			isAgreement: false,
			sourceVisible: true,
			sourceQuoteId: active.quoteId,
			agreementPerVisitTotal: 125,
			serviceDate: Date.UTC(2026, 8, 14),
			previousRevision: null,
		});
	});
});
