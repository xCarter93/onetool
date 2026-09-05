// @vitest-environment node
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Mobile pinned-path freeze (PRD-packaging-entitlements P0).
 *
 * The mobile app has NO OTA updates: every Convex public function path any
 * shipped App Store/TestFlight build references is frozen forever — deleting,
 * renaming, or reshaping one breaks live builds with no client-side fix.
 *
 * PINNED_PATHS is the union of every `api.<module>.<fn>` reference in
 * apps/mobile source across git history since the App Store era (2026-06),
 * assembled 2026-08-22. Add to it when mobile ships new paths; NEVER remove
 * an entry without proof no shipped binary references it.
 *
 * KNOWN_BROKEN documents paths that were already deleted from the backend
 * before this freeze existed — kept for the record, excluded from assertion.
 */

const PINNED_PATHS = [
	"activities.feed",
	"activities.getRecent", // 1.0.1 store build calls it; current source keeps only a comment
	"assistantChat.createThread",
	"assistantChat.listThreadMessages",
	"assistantChat.listThreads",
	"assistantChat.sendMessage",
	"assistantChat.streamResponse",
	"businessHealth.get",
	"calendar.getCalendarEvents",
	"clientContacts.create",
	"clientContacts.getPrimaryContact",
	"clientContacts.listByClient",
	"clientDocuments.create",
	"clientDocuments.generateUploadUrl",
	"clientDocuments.listByClient",
	"clientProperties.create",
	"clientProperties.listByClient",
	"clientProperties.listGeocodedWithClients",
	"clientTelemetry.trackMapboxUsage",
	"clients.create",
	"clients.get",
	"clients.list",
	"clients.listWithProjectCounts",
	"clients.listNamesForOrg",
	"clients.search", // removed from mobile 2026-07-25; in the 1.0.1 build
	"clients.update",
	"communityPages.get",
	"documents.getLatest",
	"documents.listSignedByProject", // June-era TestFlight builds
	"entitlements.getMine",
	"homeStats.getJourneyProgress", // 1.0.1 build
	"invoiceLineItems.create",
	"invoiceLineItems.listByInvoice",
	"invoiceLineItems.remove",
	"invoiceLineItems.update",
	"invoices.createFromQuote",
	"invoices.get",
	"invoices.getByQuote",
	"invoices.getOverdue",
	"invoices.getPortalLink",
	"invoices.getWithPayments",
	"invoices.list",
	"invoices.sendToClient",
	"messageAttachments.generateUploadUrl",
	"messageAttachments.listByEntity", // June-era TestFlight builds
	"messageAttachments.listByNotificationWithUrls", // pre-1.0.1 builds
	"messageAttachments.listByTeamMessageWithUrls",
	"notificationPreferences.get",
	"notificationPreferences.set",
	"notifications.createMention",
	"notifications.listByEntity", // pre-1.0.1 builds
	"notifications.listForCurrentUser",
	"notifications.markRead",
	"organizations.completeMetadata",
	"organizations.get",
	"organizations.needsMetadataCompletion",
	"payments.recordManualPayment",
	"pdfActions.ensureQuotePdf",
	"permissions.hasPremiumAccess",
	"permissions.myPermissions",
	"projectDocuments.create",
	"projectDocuments.generateUploadUrl",
	"projectDocuments.listByProject",
	"projects.create",
	"projects.get",
	"projects.list",
	"projects.search", // 1.0.1 build
	"projects.update",
	"push.registerToken",
	"quoteLineItems.create",
	"quoteLineItems.listByQuote",
	"quoteLineItems.remove",
	"quoteLineItems.update",
	"quotes.approveInPerson",
	"quotes.create",
	"quotes.extendValidUntil",
	"quotes.generateSignatureUploadUrl",
	"quotes.get",
	"quotes.getApprovalAudit",
	"quotes.getAwaitingSigning", // 1.0.1 build
	"quotes.list",
	"quotes.sendToClient",
	"quotes.update",
	"routes.completeRoute",
	"routes.copyToDaily",
	"routes.create",
	"routes.list",
	"routes.seedFromSchedule",
	"routes.setStopStatus",
	"routes.startRoute",
	"routes.update",
	"routingActions.computeRoute",
	"routingActions.searchGasAlongRoute",
	"search.globalSearch",
	"tasks.complete",
	"tasks.create",
	"tasks.get",
	"tasks.getOverdue",
	"tasks.getStats", // June-era builds
	"tasks.getUpcoming", // June-era builds
	"tasks.list",
	"tasks.remove",
	"tasks.update",
	"teamMessages.listByEntity",
	"users.current",
	"users.listByOrg",
	"users.syncUserFromClerk",
] as const;

/** Already deleted from the backend BEFORE this freeze existed (2026-07-30 /
 * 2026-08-11 / pre-era). The 1.0.1 store build references the first two — a
 * known live breakage, tracked separately; do not "fix" by re-adding here. */
const KNOWN_BROKEN = new Set([
	"homeStatsOptimized.getHomeStats",
	"invoices.getStats",
	"tasks.listWithDetails",
]);

const CONVEX_DIR = path.dirname(fileURLToPath(import.meta.url));

describe("mobile pinned Convex paths", () => {
	const byModule = new Map<string, string[]>();
	for (const pinned of PINNED_PATHS) {
		const [moduleName, fn] = pinned.split(".");
		const fns = byModule.get(moduleName) ?? [];
		fns.push(fn);
		byModule.set(moduleName, fns);
	}

	for (const [moduleName, fns] of byModule) {
		it(`${moduleName}.ts keeps its ${fns.length} pinned export(s)`, () => {
			const file = path.join(CONVEX_DIR, `${moduleName}.ts`);
			expect(fs.existsSync(file), `module ${moduleName}.ts must exist`).toBe(
				true
			);
			const source = fs.readFileSync(file, "utf8");
			for (const fn of fns) {
				const pattern = new RegExp(`export\\s+const\\s+${fn}\\s*=`, "m");
				expect(
					pattern.test(source),
					`${moduleName}.${fn} is pinned by shipped mobile builds and must stay exported`
				).toBe(true);
			}
		});
	}

	it("known-broken paths stay documented, not silently resurrected", () => {
		for (const broken of KNOWN_BROKEN) {
			expect(
				(PINNED_PATHS as readonly string[]).includes(broken),
				`${broken} belongs in KNOWN_BROKEN only`
			).toBe(false);
		}
	});

	it("the pinned list has no duplicates", () => {
		expect(new Set(PINNED_PATHS).size).toBe(PINNED_PATHS.length);
	});

	it("every api.* reference in apps/mobile source is pinned", () => {
		const pinned = new Set<string>(PINNED_PATHS);
		const unpinned = new Set<string>();
		for (const file of walkMobileSource()) {
			const source = fs.readFileSync(file, "utf8");
			for (const match of source.matchAll(API_REF)) {
				const ref = `${match[1]}.${match[2]}`;
				if (!pinned.has(ref)) unpinned.add(`${ref} (${path.relative(MOBILE_DIR, file)})`);
			}
		}
		expect(
			[...unpinned],
			"add these to PINNED_PATHS before the build that calls them ships"
		).toEqual([]);
	});
});

const MOBILE_DIR = path.resolve(CONVEX_DIR, "../../../apps/mobile");
// Lookbehind rejects URLs like https://api.mapbox.com and nested members.
const API_REF = /(?<![\w/.])api\.([A-Za-z]\w*)\.([A-Za-z]\w*)/g;
const SKIP_DIRS = new Set(["node_modules", ".expo", "ios", "android", "dist", ".git"]);

function* walkMobileSource(dir = MOBILE_DIR): Generator<string> {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			if (!SKIP_DIRS.has(entry.name)) yield* walkMobileSource(path.join(dir, entry.name));
		} else if (/\.tsx?$/.test(entry.name)) {
			yield path.join(dir, entry.name);
		}
	}
}
