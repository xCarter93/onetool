import React, { useMemo, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { Plus } from "lucide-react-native";
import type { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import { Button, Eyebrow } from "@/components/ui";
import { formatDistance, formatDuration } from "@/lib/route-run";
import { fontFamily, radii, shadow, touch, type, useTokens } from "@/lib/theme";

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
			handleIndicatorStyle={{ backgroundColor: t.faintDecor }}
		>
			<BottomSheetScrollView contentContainerStyle={styles.content}>
				<View style={styles.headerRow}>
					<Text style={[styles.heading, { color: t.ink }]}>Routes</Text>
					{props.premium !== false ? (
						<Button
							title="New route"
							variant="primary"
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
					// Jobber-style prompt card: today has no route yet — offer
					// the two build paths right where the eye lands.
					<View
						style={[
							styles.promptCard,
							{ borderColor: t.primarySolid },
						]}
					>
						<Text style={[styles.promptTitle, { color: t.ink }]}>
							Plan today&apos;s route
						</Text>
						<PromptAction
							label="From today's schedule"
							onPress={props.onSeedSchedule}
							disabled={props.busy}
						/>
						<PromptAction
							label="Build it manually"
							onPress={props.onCreate}
							disabled={props.busy}
						/>
						{props.saved.length > 0 ? (
							<Text style={[styles.promptHint, { color: t.sub }]}>
								…or pick a saved route below.
							</Text>
						) : null}
					</View>
				) : empty ? (
					<Text style={[styles.emptyCopy, { color: t.sub }]}>
						No routes yet. Plan one on the web and it shows up here,
						ready to drive.
					</Text>
				) : null}
				{props.daily.length > 0 ? (
					<View style={styles.section}>
						<Eyebrow>Today</Eyebrow>
						{props.daily.map((r) => (
							<RouteRow
								key={r._id}
								route={r}
								onPress={() => props.onSelect(r._id)}
							/>
						))}
					</View>
				) : null}
				{props.saved.length > 0 ? (
					<View style={styles.section}>
						<Eyebrow>Saved</Eyebrow>
						{props.saved.map((r) => (
							<RouteRow
								key={r._id}
								route={r}
								onPress={() => props.onSelect(r._id)}
							/>
						))}
					</View>
				) : null}
			</BottomSheetScrollView>
		</BottomSheet>
	);
}

function PromptAction({
	label,
	onPress,
	disabled,
}: {
	label: string;
	onPress: () => void;
	disabled?: boolean;
}) {
	const t = useTokens();
	return (
		<Pressable
			onPress={onPress}
			disabled={disabled}
			accessibilityRole="button"
			accessibilityLabel={label}
			style={({ pressed }) => [
				styles.promptAction,
				{
					borderColor: t.border,
					backgroundColor: t.card,
					opacity: pressed || disabled ? 0.6 : 1,
				},
			]}
		>
			<Plus size={15} color={t.primaryInk} strokeWidth={2.5} />
			<Text style={[styles.promptActionLabel, { color: t.ink }]}>
				{label}
			</Text>
		</Pressable>
	);
}

function RouteRow({
	route,
	onPress,
}: {
	route: Doc<"routes">;
	onPress: () => void;
}) {
	const t = useTokens();
	const inProgress =
		route.startedAt !== undefined && route.completedAt === undefined;
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={`${route.name}, ${routeMeta(route)}`}
			style={({ pressed }) => [
				styles.row,
				{ borderColor: t.border, opacity: pressed ? 0.7 : 1 },
			]}
		>
			<View style={styles.rowBody}>
				<Text
					style={[styles.rowTitle, { color: t.ink }]}
					numberOfLines={1}
				>
					{route.name}
				</Text>
				<Text style={[styles.rowMeta, { color: t.sub }]}>
					{routeMeta(route)}
					{route.completedAt !== undefined
						? " · Completed"
						: inProgress
							? " · In progress"
							: ""}
				</Text>
			</View>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	content: {
		paddingHorizontal: 16,
		paddingBottom: 32,
		gap: 10,
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
	section: {
		gap: 6,
		marginTop: 6,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		borderBottomWidth: StyleSheet.hairlineWidth,
		paddingVertical: 10,
		minHeight: touch.min,
	},
	rowBody: {
		flex: 1,
		gap: 2,
	},
	rowTitle: {
		fontFamily: fontFamily.medium,
		fontSize: type.rowTitle,
	},
	rowMeta: {
		fontFamily: fontFamily.regular,
		fontSize: type.meta,
	},
	promptCard: {
		borderWidth: 1.5,
		borderStyle: "dashed",
		borderRadius: radii.card,
		padding: 14,
		gap: 8,
	},
	promptTitle: {
		fontFamily: fontFamily.semibold,
		fontSize: type.h4,
		marginBottom: 2,
	},
	promptAction: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		borderWidth: 1,
		borderRadius: radii.ctrl,
		paddingHorizontal: 12,
		minHeight: touch.min,
	},
	promptActionLabel: {
		fontFamily: fontFamily.medium,
		fontSize: type.body,
	},
	promptHint: {
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
