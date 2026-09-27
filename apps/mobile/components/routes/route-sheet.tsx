import React, { useMemo, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { Plus } from "lucide-react-native";
import type { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import { Panel, RecordRow, SectionLabel } from "@/components/canvas";
import { Button } from "@/components/ui";
import { formatDistance, formatDuration } from "@/lib/route-run";
import { fontFamily, radii, shadow, type, useTokens } from "@/lib/theme";

// Route PICKER only — selecting a route swaps this sheet for the floating
// stop-card carousel (stop-carousel.tsx), per Patrick's round-2 redesign.

export type RouteSheetProps = {
	daily: Doc<"routes">[];
	saved: Doc<"routes">[];
	/** undefined = still loading; false hides the create affordance. */
	premium: boolean | undefined;
	busy: boolean;
	error: string | null;
	onSelect: (id: Id<"routes">) => void;
	onCreate: () => void;
	onSeedSchedule: () => void;
	/** Bottom clearance now that nothing floats over the sheet. */
	bottomInset: number;
};

function routeMeta(route: Doc<"routes">): string {
	const parts = [
		`${route.stops.length} ${route.stops.length === 1 ? "stop" : "stops"}`,
	];
	if (route.totalDistanceMeters !== undefined) {
		parts.push(formatDistance(route.totalDistanceMeters));
	}
	if (route.totalDurationSeconds !== undefined) {
		parts.push(formatDuration(route.totalDurationSeconds));
	}
	return parts.join(" · ");
}

function routeStatus(route: Doc<"routes">): string | undefined {
	if (route.completedAt !== undefined) return "completed";
	if (route.startedAt !== undefined) return "in-progress";
	return undefined;
}

export function RouteSheet(props: RouteSheetProps) {
	const t = useTokens();
	const sheetRef = useRef<BottomSheet>(null);
	const snapPoints = useMemo(() => ["24%", "55%", "88%"], []);
	const empty = props.daily.length === 0 && props.saved.length === 0;

	return (
		<BottomSheet
			ref={sheetRef}
			index={1}
			snapPoints={snapPoints}
			enablePanDownToClose={false}
			backgroundStyle={{
				backgroundColor: t.card,
				borderRadius: radii.sheet,
				boxShadow: shadow.sheet,
			}}
			// t.sub, not faintDecor — the drag handle is an interactive affordance,
			// not decoration, and faintDecor (2.46:1) fails even the 3:1 control floor.
			handleIndicatorStyle={{ backgroundColor: t.sub }}
		>
			<BottomSheetScrollView
				contentContainerStyle={[
					styles.content,
					{ paddingBottom: 32 + props.bottomInset },
				]}
			>
				<View style={styles.headerRow}>
					<Text style={[styles.heading, { color: t.ink }]}>Routes</Text>
					{props.premium !== false ? (
						<Button
							title="New route"
							size="sm"
							icon={<Plus size={13} color={t.frostedInk} strokeWidth={2.5} />}
							onPress={props.onCreate}
						/>
					) : null}
				</View>
				{props.error ? (
					<Text style={[styles.error, { color: t.danger }]}>
						{props.error}
					</Text>
				) : null}
				{props.premium !== false && props.daily.length === 0 ? (
					<>
						<SectionLabel title="Plan today's route" />
						<View style={styles.planActions}>
							<Button
								title="From today's schedule"
								variant="secondary"
								onPress={props.onSeedSchedule}
								disabled={props.busy}
							/>
							<Button
								title="Build it manually"
								variant="secondary"
								onPress={props.onCreate}
								disabled={props.busy}
							/>
						</View>
						{props.saved.length > 0 ? (
							<Text style={[styles.planHint, { color: t.sub }]}>
								…or pick a saved route below.
							</Text>
						) : null}
					</>
				) : empty ? (
					<Text style={[styles.emptyCopy, { color: t.sub }]}>
						No routes yet. Plan one on the web and it shows up here,
						ready to drive.
					</Text>
				) : null}
				{props.daily.length > 0 ? (
					<>
						<SectionLabel title="Today" />
						<Panel>
							{props.daily.map((r) => (
								<RecordRow
									key={r._id}
									kind="route"
									title={r.name}
									subtitle={routeMeta(r)}
									status={routeStatus(r)}
									onPress={() => props.onSelect(r._id)}
								/>
							))}
						</Panel>
					</>
				) : null}
				{props.saved.length > 0 ? (
					<>
						<SectionLabel title="Saved" />
						<Panel>
							{props.saved.map((r) => (
								<RecordRow
									key={r._id}
									kind="route"
									title={r.name}
									subtitle={routeMeta(r)}
									status={routeStatus(r)}
									onPress={() => props.onSelect(r._id)}
								/>
							))}
						</Panel>
					</>
				) : null}
			</BottomSheetScrollView>
		</BottomSheet>
	);
}

const styles = StyleSheet.create({
	content: {
		paddingHorizontal: 16,
		paddingBottom: 32,
		gap: 16,
	},
	headerRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	heading: {
		fontFamily: fontFamily.semibold,
		fontSize: type.h3,
	},
	planActions: {
		gap: 8,
	},
	planHint: {
		fontFamily: fontFamily.regular,
		fontSize: type.meta,
	},
	emptyCopy: {
		fontFamily: fontFamily.regular,
		fontSize: type.body,
		lineHeight: 20,
		paddingVertical: 12,
	},
	error: {
		fontFamily: fontFamily.medium,
		fontSize: type.sm,
	},
});
