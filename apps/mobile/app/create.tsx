import { View, Text, Pressable, StyleSheet } from "react-native";
import { router, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ListChecks, UserPlus, ChevronRight } from "lucide-react-native";
import { fontFamily, type, radii, createGlyph, useTokens } from "@/lib/theme";
import { CenteredModal } from "@/components/ipad/centered-modal";
import { useDevice } from "@/lib/use-device";
import { requestShellCreate } from "@/lib/shell-nav";

// Create action-sheet — presentation (detents/corner) lives in _layout.tsx.
// Exactly two create entry points; the ＋ FAB is the only opener.
const OPTIONS = [
	{
		href: "/tasks/form",
		Icon: ListChecks,
		tone: createGlyph.task,
		title: "New Task",
		desc: "Schedule work for a crew",
	},
	{
		href: "/clients/new",
		Icon: UserPlus,
		tone: createGlyph.client,
		title: "New Client",
		desc: "Add a contact",
	},
] as const;

export default function CreateSheet() {
	const t = useTokens();
	const insets = useSafeAreaInsets();
	const { device } = useDevice();

	// Dismiss-then-push (verbatim from notifications.tsx) — synchronous, no delay.
	// EXCEPTION: on iPad, "New Client" opens IN-PANE. This modal is a
	// transparentModal OUTSIDE the shell tree (can't call useShellNav), so it
	// hands the request to the still-mounted shell via the module-level signal,
	// then just dismisses — no router.push to /clients/new (which slides the
	// whole shell). iPhone keeps dismiss-then-push (byte-identical).
	const choose = (href: string) => {
		if (device === "ipad" && href === "/clients/new") {
			requestShellCreate("clients");
			router.back();
			return;
		}
		router.back();
		router.push(href as Href);
	};

	// Body content is identical across devices; only the outer container differs.
	const content = (
		<>
			<View style={styles.titleRow}>
				<Text style={[styles.title, { color: t.ink }]}>Create</Text>
			</View>
			<View style={styles.list}>
				{OPTIONS.map(({ href, Icon, tone, title, desc }) => (
					<Pressable
						key={href}
						onPress={() => choose(href)}
						accessibilityRole="button"
						accessibilityLabel={title}
						style={({ pressed }) => [
							styles.row,
							{ borderColor: t.line },
							pressed && { backgroundColor: t.surface },
						]}
					>
						<View style={[styles.iconTile, { backgroundColor: tone + "16" }]}>
							<Icon size={22} color={tone} />
						</View>
						<View style={styles.rowText}>
							<Text style={[styles.rowTitle, { color: t.ink }]}>{title}</Text>
							<Text style={[styles.rowDesc, { color: t.sub }]}>{desc}</Text>
						</View>
						<ChevronRight size={18} color={t.faint} style={styles.chevron} />
					</Pressable>
				))}
			</View>
		</>
	);

	// iPad (Strategy B): CenteredModal owns the scrim + centered card (the root
	// Stack presents this route as a transparentModal). No grabber/bottom-sheet
	// chrome inside the card.
	if (device === "ipad") {
		return (
			<CenteredModal onScrimPress={() => router.back()}>
				<View style={[styles.padCard, { backgroundColor: t.card }]}>
					{content}
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
			{content}
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
	// iPad card padding (CenteredModal supplies the card shell + radius).
	padCard: {
		paddingTop: 20,
		paddingBottom: 20,
	},
	grabber: {
		alignSelf: "center",
		width: 44,
		height: 5,
		borderRadius: 999,
		marginTop: 10,
		marginBottom: 16,
	},
	titleRow: {
		paddingHorizontal: 20,
		marginBottom: 14,
	},
	title: {
		fontSize: type.h2,
		lineHeight: 30,
		fontFamily: fontFamily.semibold,
	},
	list: {
		gap: 8,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		borderWidth: 1,
		borderRadius: radii.r,
		paddingHorizontal: 16,
		paddingVertical: 14,
		marginHorizontal: 16,
		minHeight: 44,
	},
	iconTile: {
		width: 48,
		height: 48,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	rowText: {
		flex: 1,
	},
	rowTitle: {
		fontSize: 14,
		fontFamily: fontFamily.semibold,
	},
	rowDesc: {
		fontSize: type.body,
		fontFamily: fontFamily.regular,
		marginTop: 2,
	},
	chevron: {
		marginLeft: "auto",
	},
});
