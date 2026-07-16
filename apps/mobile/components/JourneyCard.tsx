import { View, Text, Pressable, StyleSheet } from "react-native";
import { router, type Href } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { ChevronRight } from "lucide-react-native";
import { Ring } from "@/components/ui";
import { fontFamily, useTokens } from "@/lib/theme";
import { journeySteps, countCompletedSteps } from "@/lib/journey";

// Compact gauge KPI tile for onboarding progress. Tapping opens the /journey
// form sheet (same shared sheet chrome as org-switch / notifications / day-sheet).
export function JourneyCard() {
	const t = useTokens();
	const progress = useQuery(api.homeStats.getJourneyProgress);

	const total = journeySteps.length;
	const completed = countCompletedSteps(progress);
	const pct = Math.round((completed / total) * 100);
	const loading = progress === undefined;

	// null = caller lacks the view grants behind the checklist (RBAC) — hide it.
	if (progress === null) return null;

	return (
		<Pressable
			onPress={() => router.push("/journey" as Href)}
			accessibilityRole="button"
			accessibilityLabel={`Your Journey, ${completed} of ${total} steps complete`}
			style={({ pressed }) => [
				styles.card,
				{ backgroundColor: t.card, borderColor: t.line },
				pressed && styles.pressed,
			]}
		>
			<Ring
				pct={loading ? 0 : pct}
				size={54}
				stroke={6}
				color={t.accent}
				track="#eef1f5"
			>
				<Text style={[styles.pct, { color: t.ink }]}>
					{loading ? "—" : `${pct}%`}
				</Text>
			</Ring>
			<View style={styles.body}>
				<Text style={[styles.title, { color: t.ink }]}>Your Journey</Text>
				<Text style={[styles.sub, { color: t.sub }]}>
					{completed} of {total} steps complete
				</Text>
			</View>
			<ChevronRight size={20} color={t.faint} />
		</Pressable>
	);
}

const styles = StyleSheet.create({
	card: {
		flexDirection: "row",
		alignItems: "center",
		gap: 14,
		padding: 14,
		borderRadius: 16,
		borderWidth: 1,
		marginBottom: 24,
	},
	pressed: {
		opacity: 0.85,
	},
	pct: {
		fontSize: 12,
		fontFamily: fontFamily.bold,
	},
	body: {
		flex: 1,
	},
	title: {
		fontSize: 14,
		fontFamily: fontFamily.semibold,
		marginBottom: 2,
	},
	sub: {
		fontSize: 12,
		fontFamily: fontFamily.regular,
	},
});
