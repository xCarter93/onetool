import React, { useEffect, useRef } from "react";
import {
	ScrollView,
	StyleSheet,
	Text,
	View,
	useWindowDimensions,
} from "react-native";
import { Navigation } from "lucide-react-native";
import type { Doc } from "@onetool/backend/convex/_generated/dataModel";
import { Button, Eyebrow } from "@/components/ui";
import {
	formatDistance,
	formatDuration,
	legForStop,
	runProgress,
	stopsInOrder,
	type RouteStop,
} from "@/lib/route-run";
import { fontFamily, radii, shadow, type, useTokens } from "@/lib/theme";

// Floating card carousel over the map (Patrick's mock): card 0 is the route
// overview, cards 1..n are stops. The parent owns focusIndex — swiping commits
// it upward, external changes (auto-advance to next pending stop) scroll here.

const CARD_GAP = 10;
const H_INSET = 24;

export type StopCarouselProps = {
	route: Doc<"routes">;
	running: boolean;
	premium: boolean | undefined;
	busy: boolean;
	error: string | null;
	googleMaps: boolean;
	focusIndex: number;
	onFocusChange: (index: number) => void;
	onStart: () => void;
	onFinish: () => void;
	onUseToday: () => void;
	onCompute: () => void;
	onEdit: () => void;
	onSetStatus: (order: number, status: "visited" | "skipped" | "pending") => void;
	onNavigate: (stop: RouteStop, app: "apple" | "google") => void;
	/** Whole-route Google Maps handoff; undefined hides the action. */
	onSendGoogle?: () => void;
	/** Waypoint-cap note, e.g. "Sends the next 10 stops — 3 left off." */
	sendGoogleNote?: string | null;
};

export function StopCarousel(props: StopCarouselProps) {
	const t = useTokens();
	const { width } = useWindowDimensions();
	const scrollRef = useRef<ScrollView>(null);
	const cardWidth = Math.min(width, 500) - H_INSET * 2;
	const snap = cardWidth + CARD_GAP;

	const stops = stopsInOrder(props.route.stops);

	// External focus changes (selection, auto-advance) scroll the strip; the
	// strip's own momentum-end reports back through onFocusChange.
	useEffect(() => {
		scrollRef.current?.scrollTo({
			x: props.focusIndex * snap,
			animated: true,
		});
	}, [props.focusIndex, snap]);

	return (
		<View style={styles.wrap} pointerEvents="box-none">
			<ScrollView
				ref={scrollRef}
				horizontal
				showsHorizontalScrollIndicator={false}
				snapToInterval={snap}
				snapToAlignment="start"
				decelerationRate="fast"
				contentContainerStyle={[
					styles.strip,
					{ paddingHorizontal: H_INSET },
				]}
				onMomentumScrollEnd={(e) => {
					const page = Math.round(e.nativeEvent.contentOffset.x / snap);
					const clamped = Math.max(0, Math.min(page, stops.length));
					if (clamped !== props.focusIndex) props.onFocusChange(clamped);
				}}
			>
				<View
					style={[
						styles.card,
						{
							width: cardWidth,
							backgroundColor: t.card,
							borderColor: t.border,
						},
					]}
				>
					<OverviewCard {...props} />
				</View>
				{stops.map((stop, i) => (
					<View
						key={stop.order}
						style={[
							styles.card,
							{
								width: cardWidth,
								backgroundColor: t.card,
								borderColor: t.border,
							},
						]}
					>
						<StopCard {...props} stop={stop} position={i} total={stops.length} />
					</View>
				))}
			</ScrollView>
		</View>
	);
}

function OverviewCard(props: StopCarouselProps) {
	const t = useTokens();
	const { route, running } = props;
	const isDaily = route.kind === "daily";
	const progress = runProgress(route.stops);
	const meta = [
		`${progress.total} ${progress.total === 1 ? "stop" : "stops"}`,
		route.totalDistanceMeters !== undefined
			? formatDistance(route.totalDistanceMeters)
			: null,
		route.totalDurationSeconds !== undefined
			? formatDuration(route.totalDurationSeconds)
			: null,
	]
		.filter(Boolean)
		.join(" · ");

	return (
		<View style={styles.cardBody}>
			<View style={styles.titleRow}>
				<View style={styles.flex}>
					<Eyebrow color={running ? t.primaryInk : undefined}>
						{running ? "On route" : isDaily ? "Today" : "Saved"}
					</Eyebrow>
					<Text
						style={[styles.title, { color: t.ink }]}
						numberOfLines={1}
					>
						{route.name}
					</Text>
					<Text style={[styles.meta, { color: t.sub }]}>
						{running ? `${progress.done}/${progress.total} done · ${meta}` : meta}
					</Text>
				</View>
			</View>
			{props.error ? (
				<Text style={[styles.error, { color: t.danger }]}>
					{props.error}
				</Text>
			) : null}
			{props.premium === false ? (
				// Neutral copy only — no upsell (Apple anti-steering).
				<Text style={[styles.meta, { color: t.sub }]}>
					Route actions aren&apos;t included in your plan.
				</Text>
			) : (
				<View style={styles.actions}>
					{running ? (
						<Button
							title="Finish route"
							variant="secondary"
							size="sm"
							onPress={props.onFinish}
							disabled={props.busy}
						/>
					) : isDaily ? (
						<Button
							title={
								route.completedAt !== undefined
									? "Restart route"
									: "Start route"
							}
							variant="solid"
							size="sm"
							onPress={props.onStart}
							disabled={props.busy}
						/>
					) : (
						<Button
							title="Use today"
							variant="solid"
							size="sm"
							onPress={props.onUseToday}
							disabled={props.busy}
						/>
					)}
					{!running && isDaily && route.geometry === undefined ? (
						<Button
							title="Get directions"
							variant="secondary"
							size="sm"
							onPress={props.onCompute}
							disabled={props.busy}
						/>
					) : null}
					{props.onSendGoogle ? (
						<Button
							title="Send to Google Maps"
							variant="secondary"
							size="sm"
							onPress={props.onSendGoogle}
						/>
					) : null}
					{!running ? (
						<Button
							title="Edit stops"
							variant="ghost"
							size="sm"
							onPress={props.onEdit}
							disabled={props.busy}
						/>
					) : null}
				</View>
			)}
			{props.onSendGoogle && props.sendGoogleNote ? (
				<Text style={[styles.meta, { color: t.sub }]}>
					{props.sendGoogleNote}
				</Text>
			) : null}
		</View>
	);
}

function StopCard(
	props: StopCarouselProps & {
		stop: RouteStop;
		position: number;
		total: number;
	}
) {
	const t = useTokens();
	const { stop, position, total } = props;
	const leg = legForStop(props.route, stop.order);
	const status = stop.status ?? "pending";
	const canAct = props.premium !== false && !props.busy;
	// Jobber-style status rail: solid brand while pending on an active run,
	// success once visited, faded when skipped.
	const railColor =
		status === "visited"
			? t.success
			: status === "skipped"
				? t.faintDecor
				: props.running
					? t.primarySolid
					: t.border;

	return (
		<View style={styles.cardBody}>
			<View style={styles.titleRow}>
				<View style={[styles.rail, { backgroundColor: railColor }]} />
				<View style={styles.flex}>
					<Eyebrow>
						Stop {position + 1} of {total}
					</Eyebrow>
					<Text
						style={[styles.title, { color: t.ink }]}
						numberOfLines={2}
					>
						{stop.label}
					</Text>
					<Text
						style={[
							styles.meta,
							{
								color:
									status === "visited"
										? t.success
										: status === "skipped"
											? t.sub
											: t.sub,
							},
						]}
					>
						{status === "visited"
							? "Visited"
							: status === "skipped"
								? "Skipped"
								: leg
									? `${formatDistance(leg.distanceMeters)} · ${formatDuration(leg.durationSeconds)} from previous`
									: "Pending"}
					</Text>
				</View>
			</View>
			<View style={styles.actions}>
				{status === "pending" ? (
					<>
						<Button
							title="Navigate"
							variant="solid"
							size="sm"
							icon={
								<Navigation
									size={13}
									color="#ffffff"
									strokeWidth={2.25}
								/>
							}
							onPress={() => props.onNavigate(stop, "apple")}
						/>
						{props.googleMaps ? (
							<Button
								title="Google"
								variant="secondary"
								size="sm"
								onPress={() => props.onNavigate(stop, "google")}
							/>
						) : null}
						{props.running ? (
							<>
								<Button
									title="Arrived"
									variant="primary"
									size="sm"
									onPress={() =>
										props.onSetStatus(stop.order, "visited")
									}
									disabled={!canAct}
								/>
								<Button
									title="Skip"
									variant="ghost"
									size="sm"
									onPress={() =>
										props.onSetStatus(stop.order, "skipped")
									}
									disabled={!canAct}
								/>
							</>
						) : null}
					</>
				) : (
					<Button
						title="Undo"
						variant="ghost"
						size="sm"
						onPress={() => props.onSetStatus(stop.order, "pending")}
						disabled={!canAct}
					/>
				)}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 12,
	},
	strip: {
		gap: CARD_GAP,
	},
	card: {
		borderRadius: radii.card,
		borderWidth: 1,
		boxShadow: shadow.floatChip,
	},
	cardBody: {
		padding: 14,
		gap: 10,
	},
	titleRow: {
		flexDirection: "row",
		gap: 10,
	},
	rail: {
		width: 4,
		borderRadius: 2,
		alignSelf: "stretch",
	},
	flex: {
		flex: 1,
		gap: 2,
	},
	title: {
		fontFamily: fontFamily.semibold,
		fontSize: type.h4,
		lineHeight: 19,
	},
	meta: {
		fontFamily: fontFamily.regular,
		fontSize: type.meta,
	},
	actions: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 8,
	},
	error: {
		fontFamily: fontFamily.medium,
		fontSize: type.sm,
	},
});
