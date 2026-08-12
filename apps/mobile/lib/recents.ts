import AsyncStorage from "@react-native-async-storage/async-storage";

// On-device "Recently viewed" trail (Slice 6). Keyed BY ORG — a flat MRU would
// surface another org's record titles after an org switch. Entries are
// snapshots (title/sub captured at view time): rendering never queries, so a
// renamed record shows its old label until re-viewed and a deleted one lands on
// the target screen's existing not-found state. Deliberate.

export const RECENT_KINDS = [
	"client",
	"project",
	"quote",
	"invoice",
	"task",
] as const;

export type RecentKind = (typeof RECENT_KINDS)[number];

export interface RecentRecord {
	kind: RecentKind;
	/** Convex document id, stored as a plain string. */
	id: string;
	title: string;
	sub?: string;
	/** Instant of the last view (Date.now()). */
	at: number;
}

export const RECENTS_LIMIT = 12;

const keyFor = (orgId: string) => `work.recents.${orgId}`;

/** Pure MRU update: move-to-front on re-view, refresh the snapshot, cap. */
export function pushRecent(
	list: RecentRecord[],
	entry: Omit<RecentRecord, "at">,
	at: number
): RecentRecord[] {
	const rest = list.filter((r) => !(r.kind === entry.kind && r.id === entry.id));
	return [{ ...entry, at }, ...rest].slice(0, RECENTS_LIMIT);
}

function parse(raw: string | null): RecentRecord[] {
	if (!raw) return [];
	try {
		const val = JSON.parse(raw);
		if (!Array.isArray(val)) return [];
		return val.filter(
			(r): r is RecentRecord =>
				r &&
				typeof r.id === "string" &&
				typeof r.title === "string" &&
				typeof r.at === "number" &&
				// A kind this build no longer knows (or never wrote) would reach
				// recordTint/renderRow as undefined, so it is dropped here.
				(RECENT_KINDS as readonly string[]).includes(r.kind)
		);
	} catch {
		return [];
	}
}

export async function getRecents(orgId: string): Promise<RecentRecord[]> {
	try {
		return parse(await AsyncStorage.getItem(keyFor(orgId)));
	} catch {
		return [];
	}
}

/** Tail of the write chain — rejections are swallowed, never propagated. */
let writes: Promise<unknown> = Promise.resolve();

/**
 * Fire-and-forget: call from record-detail screens once the record has loaded
 * (so the title snapshot is real, not a skeleton placeholder). Never blocks or
 * throws — a failed persist just loses one trail entry.
 */
export function recordRecentView(
	orgId: string | undefined,
	entry: Omit<RecentRecord, "at">
): void {
	if (!orgId) return;
	// Chained, not concurrent: two screens recording at once would each read the
	// same list and the later write would drop the earlier entry.
	writes = writes
		.then(() => getRecents(orgId))
		.then((list) =>
			AsyncStorage.setItem(
				keyFor(orgId),
				JSON.stringify(pushRecent(list, entry, Date.now()))
			)
		)
		.catch((e) => {
			if (__DEV__) console.warn("recordRecentView persist failed", e);
		});
}

