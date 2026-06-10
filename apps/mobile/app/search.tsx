import { useEffect, useState } from "react";
import {
	View,
	Text,
	TextInput,
	Pressable,
	ScrollView,
	ActivityIndicator,
	StyleSheet,
} from "react-native";
import { router, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { fontFamily, type, radii, STATUS, useTokens } from "@/lib/theme";

// Full-screen global search overlay (ACT-01). Content-only — presentation
// (FullSheet detent [1.0]) is registered in app/_layout.tsx. Replaces the 24-01 stub.
export default function SearchOverlay() {
	const t = useTokens();
	const insets = useSafeAreaInsets();

	// Raw input drives DISPLAY mode; debounced `q` drives query execution.
	const [raw, setRaw] = useState("");
	const [q, setQ] = useState("");
	useEffect(() => {
		const id = setTimeout(() => setQ(raw.trim()), 250);
		return () => clearTimeout(id);
	}, [raw]);

	const clientHits = useQuery(api.clients.search, q ? { query: q } : "skip");
	const projectHits = useQuery(api.projects.search, q ? { query: q } : "skip");
	const recentClients = useQuery(api.clients.list, q ? "skip" : {});
	const recentProjects = useQuery(api.projects.list, q ? "skip" : {});

	// DISPLAY mode = raw input (no ~250ms Recent lag while typing).
	const typing = raw.trim().length > 0;
	// Loading covers the debounce window (typing && !q) AND the in-flight query,
	// preventing a premature "No matches" flash before `q` resolves.
	const loading =
		typing && (clientHits === undefined || projectHits === undefined);
	const noMatches =
		typing && !!q && clientHits?.length === 0 && projectHits?.length === 0;
	const recentLoading =
		!typing && (recentClients === undefined || recentProjects === undefined);

	return (
		<View
			style={[
				styles.root,
				{ backgroundColor: t.surface, paddingTop: insets.top },
			]}
		>
			<View style={styles.header}>
				<TextInput
					style={[
						styles.input,
						{
							color: t.ink,
							backgroundColor: t.card,
							borderColor: t.line,
						},
					]}
					placeholder="Search clients, projects…"
					placeholderTextColor={t.faint}
					value={raw}
					onChangeText={setRaw}
					autoFocus
					autoCorrect={false}
					autoCapitalize="none"
					returnKeyType="search"
				/>
				<Pressable
					onPress={() => router.back()}
					hitSlop={8}
					accessibilityRole="button"
					accessibilityLabel="Cancel search"
					style={styles.cancel}
				>
					<Text style={[styles.cancelText, { color: t.accent }]}>Cancel</Text>
				</Pressable>
			</View>

			<ScrollView
				style={styles.body}
				contentContainerStyle={styles.bodyContent}
				keyboardShouldPersistTaps="handled"
				keyboardDismissMode="on-drag"
			>
				{recentLoading ? (
					<View style={styles.spinner}>
						<ActivityIndicator color={t.accent} />
					</View>
				) : loading ? (
					<View style={styles.spinner}>
						<ActivityIndicator color={t.accent} />
					</View>
				) : noMatches ? (
					<View style={styles.empty}>
						<Text style={[styles.emptyTitle, { color: t.ink }]}>No matches</Text>
						<Text style={[styles.emptySub, { color: t.sub }]}>
							Try a different name or number.
						</Text>
					</View>
				) : null}
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	root: {
		flex: 1,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		paddingHorizontal: 16,
		paddingVertical: 12,
	},
	input: {
		flex: 1,
		minHeight: 44,
		borderRadius: radii.r,
		borderWidth: 1,
		paddingHorizontal: 14,
		fontSize: type.body,
		fontFamily: fontFamily.regular,
	},
	cancel: {
		minHeight: 44,
		minWidth: 44,
		alignItems: "flex-end",
		justifyContent: "center",
	},
	cancelText: {
		fontSize: type.h4,
		fontFamily: fontFamily.semibold,
	},
	body: {
		flex: 1,
	},
	bodyContent: {
		paddingHorizontal: 16,
		paddingBottom: 24,
	},
	spinner: {
		paddingTop: 40,
		alignItems: "center",
	},
	empty: {
		paddingTop: 60,
		paddingHorizontal: 32,
		alignItems: "center",
		gap: 6,
	},
	emptyTitle: {
		fontSize: type.h4,
		fontFamily: fontFamily.semibold,
	},
	emptySub: {
		fontSize: type.body,
		fontFamily: fontFamily.regular,
		textAlign: "center",
	},
});
