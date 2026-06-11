import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Check, X } from "lucide-react-native";
import { fontFamily, type, useTokens } from "@/lib/theme";
import { journeySteps, countCompletedSteps } from "@/lib/journey";
import { CenteredModal } from "@/components/ipad/centered-modal";
import { useDevice } from "@/lib/use-device";

// Journey form-sheet route — same native sheet type + chrome as /org-switch,
// /notifications, /day-sheet. Vertical milestone list with completed state.
export default function JourneySheet() {
	const t = useTokens();
	const insets = useSafeAreaInsets();
	const { device } = useDevice();
	const progress = useQuery(api.homeStats.getJourneyProgress);

	const total = journeySteps.length;
	const completed = countCompletedSteps(progress);
	const pct = Math.round((completed / total) * 100);

	const header = (
		<View style={styles.header}>
			<View style={styles.titleWrap}>
				<Text style={[styles.title, { color: t.ink }]}>Your Journey</Text>
				<Text style={[styles.headerSub, { color: t.sub }]}>
					{completed} of {total} complete · {pct}%
				</Text>
			</View>
			<View style={styles.headerAction}>
				<Pressable
					onPress={() => router.back()}
					hitSlop={8}
					accessibilityRole="button"
					accessibilityLabel="Close"
					style={styles.closeBtn}
				>
					<X size={22} color={t.sub} />
				</Pressable>
			</View>
		</View>
	);

	const body = (
		<ScrollView
			style={styles.list}
			contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
		>
			{journeySteps.map((step, i) => {
					const done = Boolean(
						progress?.[step.completionKey as keyof typeof progress],
					);
					const Icon = step.icon;
					return (
						<View
							key={step.id}
							style={[
								styles.row,
								{ borderBottomColor: t.line },
								i === journeySteps.length - 1 && styles.rowLast,
							]}
						>
							<View
								style={[
									styles.tile,
									{
										backgroundColor: done ? t.accentSoft : t.muted,
									},
								]}
							>
								<Icon size={20} color={done ? t.accent : t.faint} />
							</View>
							<View style={styles.rowBody}>
								<Text style={[styles.rowTitle, { color: t.ink }]}>
									{step.title}
								</Text>
								<Text style={[styles.rowSub, { color: t.sub }]}>
									{step.description}
								</Text>
							</View>
							{done ? (
								<View style={[styles.checkDone, { backgroundColor: t.accent }]}>
									<Check size={14} color="#ffffff" strokeWidth={3} />
								</View>
							) : (
								<View style={[styles.checkPending, { borderColor: t.line }]} />
							)}
						</View>
					);
				})}
		</ScrollView>
	);

	// iPad (Strategy B): centered card; maxHeight 86% so the milestones scroll within it.
	if (device === "ipad") {
		return (
			<CenteredModal onScrimPress={() => router.back()} maxHeight="86%">
				<View style={[styles.padCard, { backgroundColor: t.card }]}>
					{header}
					{body}
				</View>
			</CenteredModal>
		);
	}

	// iPhone — existing bottom sheet, byte-identical.
	return (
		<View
			style={[
				styles.container,
				{ backgroundColor: t.card, paddingBottom: insets.bottom },
			]}
		>
			<View style={[styles.grabber, { backgroundColor: t.border }]} />
			{header}
			{body}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		borderTopLeftRadius: 30,
		borderTopRightRadius: 30,
		overflow: "hidden",
	},
	// iPad card (CenteredModal supplies the shell + radius + maxHeight bound).
	padCard: {
		flexShrink: 1,
		paddingTop: 18,
	},
	grabber: {
		alignSelf: "center",
		width: 44,
		height: 5,
		borderRadius: 999,
		marginTop: 10,
		marginBottom: 16,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 20,
		paddingBottom: 18,
	},
	titleWrap: {
		flex: 1,
	},
	title: {
		fontSize: 21,
		lineHeight: 30,
		fontFamily: fontFamily.bold,
	},
	headerSub: {
		fontSize: type.sm,
		fontFamily: fontFamily.regular,
		marginTop: 2,
	},
	headerAction: {
		alignItems: "flex-end",
	},
	closeBtn: {
		width: 32,
		height: 32,
		borderRadius: 999,
		alignItems: "center",
		justifyContent: "center",
	},
	list: {
		flex: 1,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 14,
		paddingVertical: 14,
		borderBottomWidth: 1,
	},
	rowLast: {
		borderBottomWidth: 0,
	},
	tile: {
		width: 40,
		height: 40,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	rowBody: {
		flex: 1,
	},
	rowTitle: {
		fontSize: 13,
		fontFamily: fontFamily.semibold,
	},
	rowSub: {
		fontSize: 12,
		fontFamily: fontFamily.regular,
		marginTop: 2,
	},
	checkDone: {
		width: 22,
		height: 22,
		borderRadius: 999,
		alignItems: "center",
		justifyContent: "center",
	},
	checkPending: {
		width: 22,
		height: 22,
		borderRadius: 999,
		borderWidth: 2,
	},
});
