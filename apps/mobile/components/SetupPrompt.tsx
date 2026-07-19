import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Building2, ChevronRight } from "lucide-react-native";
import { fontFamily, radii, spacing, tokens, type } from "@/lib/theme";

// Home-screen nudge to finish the org's business profile. Shown ONLY to the
// organization owner (the only role the backend lets save these fields) when the
// org's metadata is incomplete. Taps into the owner-only Business details editor.
// Renders nothing otherwise, so it self-gates and can be dropped in unconditionally.
export function SetupPrompt() {
	const router = useRouter();
	const needsMetadata = useQuery(api.organizations.needsMetadataCompletion);
	const org = useQuery(api.organizations.get);
	const me = useQuery(api.users.current);

	const isOwner = !!(org && me && org.ownerUserId === me._id);
	if (needsMetadata !== true || !isOwner) return null;

	return (
		<Pressable
			style={styles.banner}
			onPress={() => router.push("/business-details" as Href)}
			accessibilityRole="button"
			accessibilityLabel="Finish setting up your business"
		>
			<View style={styles.iconWrap}>
				<Building2 size={20} color={tokens.accent} />
			</View>
			<View style={styles.textWrap}>
				<Text style={styles.title}>Finish setting up your business</Text>
				<Text style={styles.sub}>
					Add your business details so quotes and invoices look complete.
				</Text>
			</View>
			<ChevronRight size={20} color={tokens.faint} />
		</Pressable>
	);
}

const styles = StyleSheet.create({
	banner: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		padding: spacing.md,
		marginBottom: spacing.md,
		borderRadius: radii.lg,
		borderWidth: 1,
		borderColor: tokens.accent,
		backgroundColor: tokens.accentSoft,
	},
	iconWrap: {
		width: 40,
		height: 40,
		borderRadius: radii.md,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: tokens.card,
	},
	textWrap: {
		flex: 1,
	},
	title: {
		fontFamily: fontFamily.bold,
		fontSize: type.h4,
		color: tokens.ink,
	},
	sub: {
		fontFamily: fontFamily.regular,
		fontSize: type.sm,
		color: tokens.sub,
		marginTop: 2,
	},
});
