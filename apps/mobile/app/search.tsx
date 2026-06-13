import { useEffect, useState, type ReactNode } from "react";
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
import type { Doc } from "@onetool/backend/convex/_generated/dataModel";
import { ChevronRight, Folder } from "lucide-react-native";
import { Avatar } from "@/components/ui";
import { fontFamily, type, radii, STATUS, useTokens } from "@/lib/theme";
import { CenteredModal } from "@/components/ipad/centered-modal";
import { useDevice } from "@/lib/use-device";

// Inline initials — no importable shared helper exists (clients/index.tsx's
// initialsFrom is module-local, non-exported). See INITIALS NOTE in 24-02 plan.
function initialsFrom(name: string): string {
	const words = name.trim().split(/\s+/).filter(Boolean);
	if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
	return name.slice(0, 2).toUpperCase();
}

// Dismiss-then-navigate (notifications.tsx pattern) — synchronous, no await/setTimeout.
const openResult = (href: string) => {
	router.back();
	router.push(href as Href);
};

// Full-screen global search overlay (ACT-01). Content-only — presentation
// (FullSheet detent [1.0]) is registered in app/_layout.tsx. Replaces the 24-01 stub.
export default function SearchOverlay() {
	const t = useTokens();
	const insets = useSafeAreaInsets();
	const { device } = useDevice();

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

	// Newest 3 by creation time (recent / empty-query state).
	const recentC = [...(recentClients ?? [])]
		.sort((a, b) => b._creationTime - a._creationTime)
		.slice(0, 3);
	const recentP = [...(recentProjects ?? [])]
		.sort((a, b) => b._creationTime - a._creationTime)
		.slice(0, 3);

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

	const header = (
		<View style={styles.header}>
			<TextInput
				style={[
					styles.input,
					{
						color: t.ink,
						backgroundColor: t.surface,
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
	);

	const body = (
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
				) : typing ? (
					<>
						{clientHits && clientHits.length > 0 ? (
							<ResultGroup label="Clients">
								{clientHits.map((c) => (
									<ClientRow key={c._id} c={c} />
								))}
							</ResultGroup>
						) : null}
						{projectHits && projectHits.length > 0 ? (
							<ResultGroup label="Projects">
								{projectHits.map((p) => (
									<ProjectRow key={p._id} p={p} />
								))}
							</ResultGroup>
						) : null}
					</>
				) : (
					<>
						<Text style={[styles.eyebrow, { color: t.faint }]}>RECENT</Text>
						{recentC.length > 0 ? (
							<ResultGroup label="Clients">
								{recentC.map((c) => (
									<ClientRow key={c._id} c={c} />
								))}
							</ResultGroup>
						) : null}
						{recentP.length > 0 ? (
							<ResultGroup label="Projects">
								{recentP.map((p) => (
									<ProjectRow key={p._id} p={p} />
								))}
							</ResultGroup>
						) : null}
					</>
				)}
		</ScrollView>
	);

	// iPad (Strategy B): centered card; maxHeight 86% so results scroll within it.
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

function ResultGroup({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	const t = useTokens();
	return (
		<View>
			<Text style={[styles.groupLabel, { color: t.faint }]}>
				{label.toUpperCase()}
			</Text>
			<View
				style={[styles.card, { backgroundColor: t.card, borderColor: t.line }]}
			>
				{children}
			</View>
		</View>
	);
}

function ClientRow({ c }: { c: Doc<"clients"> }) {
	const t = useTokens();
	return (
		<Pressable
			onPress={() => openResult(`/clients/${c._id}`)}
			style={styles.row}
			accessibilityRole="button"
		>
			<Avatar text={initialsFrom(c.companyName)} size={40} />
			<View style={styles.rowText}>
				<Text style={[styles.rowTitle, { color: t.ink }]} numberOfLines={1}>
					{c.companyName}
				</Text>
				<Text style={[styles.rowSub, { color: t.sub }]} numberOfLines={1}>
					{STATUS[c.status]?.label ?? c.status}
				</Text>
			</View>
			<ChevronRight size={18} color={t.faint} />
		</Pressable>
	);
}

function ProjectRow({ p }: { p: Doc<"projects"> }) {
	const t = useTokens();
	const sub = p.projectNumber
		? `#${p.projectNumber}`
		: (STATUS[p.status]?.label ?? p.status);
	return (
		<Pressable
			onPress={() => openResult(`/projects/${p._id}`)}
			style={styles.row}
			accessibilityRole="button"
		>
			<View style={[styles.projectTile, { backgroundColor: t.accentSoft }]}>
				<Folder size={20} color={t.accent} />
			</View>
			<View style={styles.rowText}>
				<Text style={[styles.rowTitle, { color: t.ink }]} numberOfLines={1}>
					{p.title}
				</Text>
				<Text style={[styles.rowSub, { color: t.sub }]} numberOfLines={1}>
					{sub}
				</Text>
			</View>
			<ChevronRight size={18} color={t.faint} />
		</Pressable>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		borderTopLeftRadius: 30,
		borderTopRightRadius: 30,
		overflow: "hidden",
	},
	// iPad card (CenteredModal supplies the shell + radius + definite height).
	// flex:1 (not flexShrink) so the body's flex:1 list/state resolves a basis.
	padCard: {
		flex: 1,
		paddingTop: 18,
	},
	grabber: {
		alignSelf: "center",
		width: 44,
		height: 5,
		borderRadius: 999,
		marginTop: 10,
		marginBottom: 8,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		paddingHorizontal: 16,
		paddingBottom: 12,
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
	eyebrow: {
		fontSize: type.eyebrow,
		fontFamily: fontFamily.semibold,
		letterSpacing: 0.6,
		marginTop: 8,
	},
	groupLabel: {
		fontSize: type.eyebrow,
		fontFamily: fontFamily.semibold,
		letterSpacing: 0.6,
		marginTop: 8,
	},
	card: {
		borderWidth: 1,
		borderRadius: radii.r,
		padding: 6,
		marginTop: 8,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingHorizontal: 10,
		paddingVertical: 12,
		minHeight: 44,
	},
	rowText: {
		flex: 1,
	},
	rowTitle: {
		fontSize: type.h4,
		fontFamily: fontFamily.semibold,
	},
	rowSub: {
		fontSize: type.body,
		fontFamily: fontFamily.regular,
		marginTop: 2,
	},
	projectTile: {
		width: 40,
		height: 40,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
});
