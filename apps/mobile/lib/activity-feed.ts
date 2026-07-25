// Pure display logic for the Activity tab. No React/RN imports — this module is
// unit-tested under vitest's node environment, so it must stay renderer-free
// (that rules out `@/lib/theme`, which imports StyleSheet).

import { truncateText } from "@/lib/notification-utils";

const DAY_MS = 86_400_000;

/**
 * DELIBERATE LOCAL-DAY EXCEPTION — do not "fix" this to `utcDayStartMs`.
 * `activity.timestamp` is an INSTANT (`Date.now()`), so it buckets on the
 * viewer's local day; `task.date` and friends are UTC-midnight DATE-IDs with no
 * time, which is why `lib/date.ts` / `lib/agenda.ts` bucket in UTC. Bucketing an
 * instant in UTC labels a 6pm-Eastern event "Yesterday" three hours later.
 */
function localDayStartMs(ms: number): number {
	const d = new Date(ms);
	d.setHours(0, 0, 0, 0);
	return d.getTime();
}

/**
 * Whole local days between two instants (0 = same day, 1 = yesterday). Rounded,
 * so a DST-shortened/lengthened day can't shift the answer by one.
 */
function localDayDelta(earlierMs: number, laterMs: number): number {
	return Math.round(
		(localDayStartMs(laterMs) - localDayStartMs(earlierMs)) / DAY_MS,
	);
}

const MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
] as const;

/** Longest description we hand to a row; the row also clamps to one line. */
const DESCRIPTION_MAX = 140;

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

/**
 * The subset of `api.activities.getRecent`'s row that the feed reads. Declared
 * structurally (all `string`, not literal unions) so an unrecognised
 * activityType/entityType from a newer backend degrades instead of failing to
 * type-check.
 */
export type ActivityFeedInput = {
	_id: string;
	activityType: string;
	entityType: string;
	entityId: string;
	entityName: string;
	description: string;
	timestamp: number;
};

/** lucide-react-native icon names used by the feed. Verified against the `icons` map. */
export type ActivityIconKey =
	| "Activity"
	| "BadgeDollarSign"
	| "Ban"
	| "Building2"
	| "CircleCheck"
	| "CircleX"
	| "CreditCard"
	| "FileText"
	| "FolderCheck"
	| "FolderPlus"
	| "Inbox"
	| "MailCheck"
	| "MailOpen"
	| "Receipt"
	| "Send"
	| "ShieldCheck"
	| "SquareCheckBig"
	| "SquarePen"
	| "UserMinus"
	| "UserPlus";

/**
 * A `recordTint` key. Kept as a local union rather than importing `RecordKind`
 * so this module never touches `@/lib/theme`; activity-row.tsx indexes
 * `recordTint` with it, which is where the compiler checks the two agree.
 */
export type ActivityTintKey = "client" | "project" | "quote" | "invoice" | "task";

/** Deep-link target for a row, shaped for `router.push`. */
export type ActivityLink =
	| { pathname: "/clients/[clientId]"; params: { clientId: string } }
	| { pathname: "/projects/[projectId]"; params: { projectId: string } }
	| { pathname: "/quote/[id]"; params: { id: string } }
	| { pathname: "/invoice/[id]"; params: { id: string } };

/** Everything a row renders. Presentation-ready: never undefined, never empty. */
export type ActivityDisplay = {
	id: string;
	icon: ActivityIconKey;
	/** One-line human-readable sentence. */
	description: string;
	/** Display name of the affected record. */
	recordName: string;
	/** Tile tint key, or null for neutral chrome. */
	tint: ActivityTintKey | null;
	/** A `STATUS` key for `<Badge>`, or null when the event carries no status. */
	status: string | null;
	/** Where tapping goes, or null when the record has no mobile detail route. */
	link: ActivityLink | null;
	timestamp: number;
};

/** One day's worth of rows, newest day first. */
export type ActivityDaySection = {
	/** Local midnight of the day. */
	dayStartMs: number;
	/** "Today" | "Yesterday" | "Jul 12" | "Jul 12, 2025" */
	label: string;
	items: ActivityDisplay[];
};

/** Flattened section list for FlashList (headers and rows in one array). */
export type ActivityFeedItem =
	| { kind: "header"; key: string; label: string; count: number }
	| { kind: "row"; key: string; activity: ActivityDisplay };

// ----------------------------------------------------------------------------
// Event → icon / status
// ----------------------------------------------------------------------------

// Icons and STATUS keys only. Colour comes from `recordTint`/`badgeTone` at the
// component boundary — this is deliberately NOT an event→colour map.
const EVENT_META: Record<
	string,
	{ icon: ActivityIconKey; status?: string }
> = {
	client_created: { icon: "UserPlus" },
	client_updated: { icon: "SquarePen" },
	project_created: { icon: "FolderPlus" },
	project_updated: { icon: "SquarePen" },
	project_completed: { icon: "FolderCheck", status: "completed" },
	quote_created: { icon: "FileText" },
	quote_sent: { icon: "Send", status: "sent" },
	quote_approved: { icon: "CircleCheck", status: "approved" },
	quote_declined: { icon: "CircleX", status: "declined" },
	quote_pdf_generated: { icon: "FileText" },
	invoice_created: { icon: "Receipt" },
	invoice_sent: { icon: "Send", status: "sent" },
	invoice_paid: { icon: "BadgeDollarSign", status: "paid" },
	payment_created: { icon: "CreditCard", status: "pending" },
	payment_updated: { icon: "CreditCard" },
	payment_paid: { icon: "BadgeDollarSign", status: "paid" },
	payment_cancelled: { icon: "Ban", status: "cancelled" },
	payments_configured: { icon: "CreditCard" },
	task_created: { icon: "SquareCheckBig" },
	task_completed: { icon: "CircleCheck", status: "completed" },
	user_invited: { icon: "UserPlus" },
	user_removed: { icon: "UserMinus" },
	member_permissions_updated: { icon: "ShieldCheck" },
	organization_updated: { icon: "Building2" },
	email_sent: { icon: "Send", status: "sent" },
	email_delivered: { icon: "MailCheck" },
	email_opened: { icon: "MailOpen" },
	email_received: { icon: "Inbox" },
};

const TINT_BY_ENTITY: Record<string, ActivityTintKey> = {
	client: "client",
	project: "project",
	quote: "quote",
	invoice: "invoice",
	task: "task",
};

/** The event types the feed knows by name. Anything else falls back to "Activity". */
export function knownActivityTypes(): string[] {
	return Object.keys(EVENT_META);
}

/**
 * "invoice_paid" → "Invoice paid". Last-resort label when the backend sent an
 * empty description, so a row never renders blank or "undefined".
 */
export function humanizeEventType(activityType: string): string {
	const words = String(activityType ?? "")
		.split(/[_\s]+/)
		.filter(Boolean);
	if (words.length === 0) return "Activity";
	const sentence = words.join(" ").toLowerCase();
	return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/** Deep-link target for an activity, or null when the entity has no route. */
export function linkForActivity(
	entityType: string,
	entityId: string,
): ActivityLink | null {
	const id = typeof entityId === "string" ? entityId.trim() : "";
	if (!id) return null;
	switch (entityType) {
		case "client":
			return { pathname: "/clients/[clientId]", params: { clientId: id } };
		case "project":
			return { pathname: "/projects/[projectId]", params: { projectId: id } };
		case "quote":
			return { pathname: "/quote/[id]", params: { id } };
		case "invoice":
			return { pathname: "/invoice/[id]", params: { id } };
		default:
			// payment / user / organization have no mobile detail route.
			return null;
	}
}

/** Backend activity row → the row's display shape. Total: never throws. */
export function toActivityDisplay(
	activity: ActivityFeedInput,
	index = 0,
): ActivityDisplay {
	const activityType = activity?.activityType ?? "";
	const entityType = activity?.entityType ?? "";
	const meta = EVENT_META[activityType];
	const rawDescription =
		typeof activity?.description === "string" ? activity.description.trim() : "";
	const description = truncateText(
		rawDescription || humanizeEventType(activityType),
		DESCRIPTION_MAX,
	);
	const rawName =
		typeof activity?.entityName === "string" ? activity.entityName.trim() : "";

	// A blank _id would collide as a FlashList key — fall back to the index.
	const id =
		typeof activity?._id === "string" && activity._id.length > 0
			? activity._id
			: `activity-${index}`;

	return {
		id,
		icon: meta?.icon ?? "Activity",
		description,
		recordName: rawName || humanizeEventType(entityType || "record"),
		tint: TINT_BY_ENTITY[entityType] ?? null,
		status: meta?.status ?? null,
		link: linkForActivity(entityType, activity?.entityId ?? ""),
		timestamp:
			typeof activity?.timestamp === "number" &&
			Number.isFinite(activity.timestamp)
				? activity.timestamp
				: 0,
	};
}

// ----------------------------------------------------------------------------
// Day grouping + labels
// ----------------------------------------------------------------------------

/** "Jul 12", or "Jul 12, 2025" when the year differs from `nowMs`. Local calendar. */
export function absoluteDayLabel(dayStartMs: number, nowMs: number): string {
	const d = new Date(dayStartMs);
	const label = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
	return d.getFullYear() === new Date(nowMs).getFullYear()
		? label
		: `${label}, ${d.getFullYear()}`;
}

/** "Today" / "Yesterday" / absolute date, bucketed on LOCAL days (see localDayStartMs). */
export function dayLabel(dayStartMs: number, nowMs: number): string {
	const delta = localDayDelta(dayStartMs, nowMs);
	if (delta === 0) return "Today";
	if (delta === 1) return "Yesterday";
	return absoluteDayLabel(dayStartMs, nowMs);
}

/**
 * Compact right-aligned stamp: "now", "14m", "3h", "Yesterday", "4d", "Jul 12".
 * Day-scale answers bucket on LOCAL days so they agree with the section headers.
 */
export function compactRelativeTime(timestamp: number, nowMs: number): string {
	const diff = nowMs - timestamp;
	if (!Number.isFinite(diff) || diff < 60_000) return "now";

	const minutes = Math.floor(diff / 60_000);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h`;

	const dayDelta = localDayDelta(timestamp, nowMs);
	if (dayDelta <= 1) return "Yesterday";
	if (dayDelta < 7) return `${dayDelta}d`;
	return absoluteDayLabel(timestamp, nowMs);
}

/**
 * Group activities into reverse-chronological LOCAL day sections. Days descend,
 * and rows descend by timestamp inside each day, regardless of input order.
 */
export function groupByDay(
	activities: ActivityFeedInput[],
	nowMs: number,
): ActivityDaySection[] {
	if (!activities || activities.length === 0) return [];

	const buckets = new Map<number, ActivityDisplay[]>();
	activities.forEach((activity, index) => {
		const display = toActivityDisplay(activity, index);
		const day = localDayStartMs(display.timestamp);
		const bucket = buckets.get(day);
		if (bucket) bucket.push(display);
		else buckets.set(day, [display]);
	});

	return [...buckets.entries()]
		.sort((a, b) => b[0] - a[0])
		.map(([dayStartMs, items]) => ({
			dayStartMs,
			label: dayLabel(dayStartMs, nowMs),
			items: items.sort((a, b) => b.timestamp - a.timestamp),
		}));
}

/** Sections flattened into one FlashList array (day header, then its rows). */
export function buildActivityFeed(
	activities: ActivityFeedInput[],
	nowMs: number,
): ActivityFeedItem[] {
	const out: ActivityFeedItem[] = [];
	for (const section of groupByDay(activities, nowMs)) {
		out.push({
			kind: "header",
			key: `day-${section.dayStartMs}`,
			label: section.label,
			count: section.items.length,
		});
		for (const activity of section.items) {
			out.push({ kind: "row", key: activity.id, activity });
		}
	}
	return out;
}
