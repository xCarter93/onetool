import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useReopenTabBarAtTop } from "@/lib/shell-chrome";
import { usePaginatedQuery } from "convex/react";
import { useRouter, type Href } from "expo-router";
import { Activity as ActivityIcon } from "lucide-react-native";
import { api } from "@onetool/backend/convex/_generated/api";
import { fontFamily, useTokens } from "@/lib/theme";
import { GUTTER, EmptyPanel, NOTCH_CLEARANCE, PageHeader, Panel, SectionLabel, CANVAS_HEADER as canvasHeader } from "@/components/canvas";
import { Button } from "@/components/ui";
import { ActivityRow } from "@/components/activity/activity-row";
import { groupByDay, type ActivityDaySection, type ActivityLink } from "@/lib/activity-feed";
import { sameRef, type RecordRef } from "@/lib/selection-context";

// Every loaded page stays a live subscription; cap mirrors web's SHEET_MAX_ITEMS
// (home/components/activity-card.tsx).
const PAGE_SIZE = 25;
const MAX_ITEMS = 200;

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

// headerMode/onSelect/selected default off → the iPhone path (router.push, own
// page header, no selected highlight) is byte-identical. The iPad shell renders
// this as the Activity pane: headerMode="pane" suppresses the page header (the
// shell mounts PaneHeader), onSelect drives the detail pane via the shell
// selection instead of a route push, selected marks the row.
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
	const reopenAtTop = useReopenTabBarAtTop();
	const router = useRouter();
	const isPane = headerMode === "pane";
	// Seed "now" once (lazy) — react-hooks/purity forbids Date.now() during render.
	const [nowMs] = useState(() => Date.now());

	const {
		results: activities,
		status,
		loadMore,
	} = usePaginatedQuery(api.activities.feed, {}, { initialNumItems: PAGE_SIZE });

	const days = useMemo(() => groupByDay(activities, nowMs), [activities, nowMs]);

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

	const renderDay = ({ item }: { item: ActivityDaySection }) => (
		<View style={styles.day}>
			<SectionLabel
				title={item.label}
				right={
					<Text style={[styles.dayCount, { color: t.sub }]}>
						{item.items.length} {item.items.length === 1 ? "event" : "events"}
					</Text>
				}
			/>
			<Panel>
				{item.items.map((activity) => {
					const ref = activity.link ? refFromActivityLink(activity.link) : null;
					return (
						<ActivityRow
							key={activity.id}
							activity={activity}
							nowMs={nowMs}
							selected={isPane && sameRef(ref, selected)}
							onPress={activity.link ? () => openRecord(activity.link!) : undefined}
						/>
					);
				})}
			</Panel>
		</View>
	);

	const Skeleton = (
		<View style={styles.day}>
			<SectionLabel title="Today" />
			<Panel>
				{[0, 1, 2].map((i) => (
					<View key={i} style={styles.skeletonRow}>
						<View style={[styles.skeletonTile, { backgroundColor: t.lineSoft }]} />
						<View style={styles.skeletonBody}>
							<View style={[styles.skeleton, { backgroundColor: t.lineSoft, width: "62%", height: 13 }]} />
							<View
								style={[
									styles.skeleton,
									{ backgroundColor: t.lineSoft, width: "34%", height: 11, marginTop: 6 },
								]}
							/>
						</View>
					</View>
				))}
			</Panel>
		</View>
	);

	const loadingMore = status === "LoadingMore";
	const atCap = activities.length >= MAX_ITEMS;
	const Footer =
		days.length === 0 ? null : status === "Exhausted" ? (
			<Text style={[styles.footerNote, { color: t.sub }]}>You are all caught up.</Text>
		) : atCap ? (
			<Text style={[styles.footerNote, { color: t.sub }]}>
				{`Showing the ${MAX_ITEMS} most recent events.`}
			</Text>
		) : (
			<Button
				title={loadingMore ? "Loading older activity" : "Load older activity"}
				variant="secondary"
				onPress={() => loadMore(Math.min(PAGE_SIZE, MAX_ITEMS - activities.length))}
				disabled={loadingMore}
				style={styles.loadMore}
			/>
		);

	// The list leads so UIKit can minimize the tab bar from it; the title rides in its header.
	const headerInList = !isPane && status !== "LoadingFirstPage";

	return (
		<View style={styles.screen}>
			{isPane || headerInList ? null : (
				<View style={canvasHeader}>
					<PageHeader title="Activity" />
				</View>
			)}
			{status === "LoadingFirstPage" ? (
				<View style={[styles.listContent, { paddingTop: 12 }]}>
					{Skeleton}
				</View>
			) : (
				<FlashList
					contentInsetAdjustmentBehavior="automatic"
					onScroll={reopenAtTop}
					scrollEventThrottle={16}
					data={days}
					keyExtractor={(item) => `day-${item.dayStartMs}`}
					renderItem={renderDay}
					ListHeaderComponent={
						headerInList ? (
							<View style={styles.headerInList}>
								<PageHeader title="Activity" />
							</View>
						) : null
					}
					contentContainerStyle={{
						...styles.listContent,
						paddingTop: headerInList ? NOTCH_CLEARANCE : 12,
					}}
					ItemSeparatorComponent={() => <View style={styles.daySpacer} />}
					ListEmptyComponent={
						<EmptyPanel
							icon={ActivityIcon}
							title="Nothing has happened yet"
							body="Approvals, payments and status changes across your business land here as they happen, newest first."
						/>
					}
					ListFooterComponent={Footer}
				/>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
	},
	listContent: {
		paddingHorizontal: GUTTER,
		paddingBottom: 32,
	},
	headerInList: {
		marginBottom: 12,
	},
	day: {
		gap: 8,
	},
	daySpacer: {
		height: 16,
	},
	dayCount: {
		fontFamily: fontFamily.medium,
		fontSize: 11.5,
	},
	skeletonRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 11,
		paddingVertical: 11,
		paddingHorizontal: 12,
	},
	skeletonTile: {
		width: 32,
		height: 32,
		borderRadius: 8,
	},
	skeletonBody: {
		flex: 1,
	},
	skeleton: {
		borderRadius: 4,
	},
	loadMore: {
		marginTop: 8,
		alignSelf: "center",
	},
	footerNote: {
		marginTop: 8,
		fontFamily: fontFamily.regular,
		fontSize: 12,
		textAlign: "center",
	},
});
