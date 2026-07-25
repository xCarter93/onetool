import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { usePaginatedQuery } from "convex/react";
import { useRouter, type Href } from "expo-router";
import { api } from "@onetool/backend/convex/_generated/api";
import { Activity as ActivityGlyph } from "lucide-react-native";
import {
	fontFamily,
	radii,
	spacing,
	tokens,
	touch,
	type,
	useTokens,
} from "@/lib/theme";
import { AppHeader } from "@/components/app-header";
import { DotGrid, SCROLL_TOP_INSET } from "@/components/ui";
import {
	ActivityDayHeader,
	ActivityRow,
} from "@/components/activity/activity-row";
import {
	buildActivityFeed,
	type ActivityFeedItem,
	type ActivityLink,
} from "@/lib/activity-feed";
import { sameRef, type RecordRef } from "@/lib/selection-context";

// Cursor-paginated feed: each "load older" fetches only the next page, so
// there's no hard ceiling. PAGE_SIZE keeps the first paint cheap.
const PAGE_SIZE = 100;

/**
 * ActivityLink → detail-pane ref, for the iPad shell's onSelect. Null for
 * links with no detail body (payment/user/organization events, which already
 * carry a null `link` upstream — the default case is defensive, not reachable
 * through the current ActivityLink union).
 */
export function refFromActivityLink(link: ActivityLink): RecordRef | null {
	switch (link.pathname) {
		case "/clients/[clientId]":
			return { kind: "client", id: link.params.clientId };
		case "/projects/[projectId]":
			return { kind: "project", id: link.params.projectId };
		case "/quote/[id]":
			return { kind: "quote", id: link.params.id };
		case "/invoice/[id]":
			return { kind: "invoice", id: link.params.id };
		default:
			return null;
	}
}

// headerMode/onSelect/selected default off → the iPhone path (router.push, its
// own AppHeader, no selected highlight) is byte-identical. The iPad shell
// renders this as the Activity pane: headerMode="pane" suppresses the self-
// mounted AppHeader (shell mounts PaneHeader), onSelect drives the detail pane
// via the shell selection instead of a route push, selected marks the row.
export default function ActivityScreen({
	headerMode = "root",
	onSelect,
	selected = null,
}: {
	headerMode?: "root" | "pane";
	onSelect?: (ref: RecordRef) => void;
	selected?: RecordRef | null;
} = {}) {
	const t = useTokens();
	const router = useRouter();
	const isPane = headerMode === "pane";
	// Seed "now" once (lazy) — react-hooks/purity forbids Date.now() during render.
	const [nowMs] = useState(() => Date.now());

	const {
		results: activities,
		status,
		loadMore,
	} = usePaginatedQuery(api.activities.feed, {}, { initialNumItems: PAGE_SIZE });

	const items = useMemo(
		() => buildActivityFeed(activities, nowMs),
		[activities, nowMs],
	);

	// On iPad pane: a row tap drives the shell selection when the link resolves
	// to a detail ref. Otherwise (iPhone, or a link with no detail pane body)
	// push the route exactly as before.
	const openRecord = (link: ActivityLink) => {
		if (onSelect) {
			const ref = refFromActivityLink(link);
			if (ref) {
				onSelect(ref);
				return;
			}
		}
		router.push(link as unknown as Href);
	};

	const renderItem = ({
		item,
		index,
	}: {
		item: ActivityFeedItem;
		index: number;
	}) => {
		if (item.kind === "header") {
			return <ActivityDayHeader label={item.label} count={item.count} />;
		}
		// Drop the hairline on the last row of a day group (and of the whole list).
		const next = items[index + 1];
		const ref = item.activity.link
			? refFromActivityLink(item.activity.link)
			: null;
		const isSelected = isPane && sameRef(ref, selected);
		return (
			<View style={isSelected ? { backgroundColor: t.secondary } : undefined}>
				<ActivityRow
					activity={item.activity}
					nowMs={nowMs}
					last={!next || next.kind === "header"}
					onPress={
						item.activity.link
							? () => openRecord(item.activity.link!)
							: undefined
					}
				/>
			</View>
		);
	};

	const Skeleton = (
		<View style={styles.skeletonBlock}>
			{[0, 1, 2].map((group) => (
				<View key={group}>
					<View style={styles.skeletonDay}>
						<View style={[styles.skeleton, { width: 64, height: 11 }]} />
					</View>
					{[0, 1, 2].map((i) => (
						<View key={i} style={styles.skeletonRow}>
							<View style={styles.skeletonTile} />
							<View style={styles.skeletonBody}>
								<View style={[styles.skeleton, { width: "62%", height: 13 }]} />
								<View
									style={[
										styles.skeleton,
										{ width: "34%", height: 11, marginTop: 6 },
									]}
								/>
							</View>
						</View>
					))}
				</View>
			))}
		</View>
	);

	const Empty = (
		<View style={styles.emptyState}>
			<View style={[styles.emptyIcon, { backgroundColor: t.secondary }]}>
				<ActivityGlyph size={22} color={t.sub} />
			</View>
			<Text style={[styles.emptyTitle, { color: t.ink }]}>
				Nothing has happened yet
			</Text>
			<Text style={[styles.emptyText, { color: t.sub }]}>
				Approvals, payments, and status changes across your business land here
				as they happen — newest first.
			</Text>
		</View>
	);

	const loadingMore = status === "LoadingMore";
	const Footer =
		items.length === 0 ? null : status === "Exhausted" ? (
			<Text style={[styles.footerNote, { color: t.sub }]}>
				{"You're all caught up — that's everything."}
			</Text>
		) : (
			<Pressable
				onPress={() => loadMore(PAGE_SIZE)}
				disabled={loadingMore}
				accessibilityRole="button"
				accessibilityLabel="Load older activity"
				style={({ pressed }) => [
					styles.loadMore,
					{ borderColor: t.line, backgroundColor: t.card },
					pressed && styles.pressed,
					loadingMore && styles.pressed,
				]}
			>
				<Text style={[styles.loadMoreText, { color: t.frostedInk }]}>
					{loadingMore ? "Loading older activity…" : "Load older activity"}
				</Text>
			</Pressable>
		);

	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: t.surface }} edges={[]}>
			{/* Page canvas, matching web's .workspace-canvas. */}
			<DotGrid style={StyleSheet.absoluteFill} />
			{/* Feed scrolls straight under the header, so the header's own fade is
			    correct here — no relocation needed. */}
			{!isPane ? <AppHeader mode="root" title="Activity" halftone /> : null}
			{status === "LoadingFirstPage" ? (
				<View style={styles.listContent}>{Skeleton}</View>
			) : (
				<FlashList
					data={items}
					keyExtractor={(item) => item.key}
					getItemType={(item) => item.kind}
					renderItem={renderItem}
					contentContainerStyle={styles.listContent}
					ListEmptyComponent={Empty}
					ListFooterComponent={Footer}
				/>
			)}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	listContent: {
		paddingHorizontal: spacing.md,
		paddingBottom: spacing.lg,
		paddingTop: SCROLL_TOP_INSET,
	},
	skeletonBlock: {
		gap: 4,
	},
	skeletonDay: {
		paddingTop: spacing.lg,
		paddingBottom: spacing.sm,
		paddingHorizontal: spacing.xs,
	},
	skeletonRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 11,
		paddingVertical: 11,
		paddingHorizontal: spacing.sm,
	},
	skeletonTile: {
		width: 32,
		height: 32,
		borderRadius: radii.md,
		backgroundColor: tokens.secondary,
	},
	skeletonBody: {
		flex: 1,
	},
	skeleton: {
		backgroundColor: tokens.secondary,
		borderRadius: radii.xs,
	},
	emptyState: {
		alignItems: "center",
		paddingVertical: 72,
		paddingHorizontal: spacing.lg,
	},
	emptyIcon: {
		width: 44,
		height: 44,
		borderRadius: radii.card,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: spacing.md,
	},
	emptyTitle: {
		fontFamily: fontFamily.semibold,
		fontSize: type.h3,
		marginBottom: 6,
	},
	emptyText: {
		fontFamily: fontFamily.regular,
		fontSize: type.body,
		textAlign: "center",
		lineHeight: 20,
	},
	loadMore: {
		marginTop: spacing.lg,
		minHeight: touch.min,
		borderWidth: 1,
		borderRadius: radii.ctrl,
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 12,
	},
	loadMoreText: {
		fontFamily: fontFamily.semibold,
		fontSize: type.body,
	},
	pressed: {
		opacity: 0.7,
	},
	footerNote: {
		marginTop: spacing.lg,
		fontFamily: fontFamily.regular,
		fontSize: type.meta,
		textAlign: "center",
	},
});
