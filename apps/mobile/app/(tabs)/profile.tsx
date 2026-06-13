import { useState } from "react";
import { View, Text, ScrollView, Alert, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useUser, useAuth, useOrganization } from "@clerk/expo";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { useTokens, radii, fontFamily } from "@/lib/theme";
import { Avatar, Card } from "@/components/ui";
import { Mail, Building, LogOut, Shield, Trash2 } from "lucide-react-native";
import { AppHeader } from "@/components/app-header";

// headerMode defaults to "root" → the iPhone path (self-mounted AppHeader,
// edge-to-edge content) is byte-identical. The iPad shell renders Profile as a
// single comfortable centered pane: headerMode="pane" suppresses the AppHeader
// (shell mounts the one PaneHeader title="Profile") and the content is bounded
// to a centered column so it is not stretched edge-to-edge.
export default function ProfileScreen({
	headerMode = "root",
}: {
	headerMode?: "root" | "pane";
} = {}) {
	const { user } = useUser();
	const { signOut } = useAuth();
	const { organization, membership } = useOrganization();
	const t = useTokens();
	const isPane = headerMode === "pane";

	// TRUE ownership comes from the BACKEND (Convex), NOT the Clerk org:admin role —
	// a co-admin who is not the org owner must take the member path.
	const org = useQuery(api.organizations.get);
	const me = useQuery(api.users.current);
	// Both queries must resolve before we trust the owner gate — undefined (loading)
	// would read as not-owner and wrongly route an owner down the member path.
	const ownershipResolved = org !== undefined && me !== undefined;
	const isOwner = !!(org && me && org.ownerUserId === me._id);
	// Count is for CONFIRM COPY ONLY (blast-radius warning), never the owner gate.
	const otherMembers = Math.max(0, (organization?.membersCount ?? 1) - 1);

	// Guard against a double-tap launching the destroy+delete flow twice (no spinner per CONTEXT).
	const [isDeleting, setIsDeleting] = useState(false);

	// Apple 5.1.1(v): a Sign in with Apple user must be told to revoke the app's
	// access on Apple's side. Clerk brokers the token (no refresh token exposed),
	// so we can't revoke server-side — instead we surface the manual step in the
	// delete confirmation. Match both "apple" and "oauth_apple" provider shapes.
	const hasAppleLogin = !!user?.externalAccounts?.some((a) =>
		a.provider?.toLowerCase().includes("apple"),
	);

	const handleSignOut = () => {
		Alert.alert("Sign Out", "Are you sure you want to sign out?", [
			{ text: "Cancel", style: "cancel" },
			{
				text: "Sign Out",
				style: "destructive",
				onPress: () => signOut(),
			},
		]);
	};

	const handleDeleteAccount = () => {
		if (isDeleting || !ownershipResolved) return;

		// Three-way confirm copy chosen by path BEFORE the Alert.
		let message: string;
		if (isOwner && otherMembers === 0) {
			message =
				"This permanently deletes your account and your entire organization — all clients, projects, quotes, and invoices. This cannot be undone.";
		} else if (isOwner) {
			message = `You own this organization. Deleting your account will permanently delete the organization and ALL its business data for you and ${otherMembers} other member${
				otherMembers === 1 ? "" : "s"
			} — they will lose access immediately. This cannot be undone.`;
		} else {
			// Member/co-admin: only their own account is removed; org data stays.
			message =
				"This removes your account from the organization and deletes your user. The organization's data remains for the other members. This cannot be undone.";
		}

		if (hasAppleLogin) {
			message +=
				"\n\nYou signed in with Apple. After deleting, open Settings → your name → Sign in with Apple → OneTool → Stop Using Apple ID to fully revoke access.";
		}

		Alert.alert("Delete Account", message, [
			{ text: "Cancel", style: "cancel" },
			{
				text: "Delete Account",
				style: "destructive",
				onPress: async () => {
					if (isDeleting) return;
					setIsDeleting(true);

					// Owner path: destroy the org FIRST (fires organization.deleted →
					// the 28-04 backend cascade erases all org data; child rows drain
					// asynchronously) THEN delete the user (fires user.deleted).
					if (isOwner && organization) {
						try {
							await organization.destroy();
						} catch {
							Alert.alert(
								"Delete Account",
								"Couldn't delete your account. Please try again.",
							);
							setIsDeleting(false);
							return;
						}
						// Org is gone; finishing means deleting the user.
						try {
							await user?.delete();
						} catch {
							// Partial failure: org destroyed but user remains — recoverable.
							// On retry, org is now null so isOwner is false → member path runs user.delete() alone.
							Alert.alert(
								"Delete Account",
								"Your organization was deleted, but we couldn't finish deleting your account. Tap Delete Account again to retry.",
							);
							setIsDeleting(false);
						}
						// On success the session tears down; the auth listener routes the app out.
						return;
					}

					// Member path (or org-less owner retry): just delete the user.
					try {
						await user?.delete();
					} catch {
						Alert.alert(
							"Delete Account",
							"Couldn't delete your account. Please try again.",
						);
						setIsDeleting(false);
					}
				},
			},
		]);
	};

	const initials =
		user?.firstName?.[0] ||
		user?.emailAddresses[0]?.emailAddress[0]?.toUpperCase() ||
		"?";

	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: t.surface }} edges={[]}>
			{/* iPad pane: shell mounts the one PaneHeader title="Profile" (single-header
			    convention) so the self-mounted AppHeader is suppressed. */}
			{isPane ? null : <AppHeader mode="root" title="Profile" />}
			<ScrollView
				style={{ flex: 1 }}
				contentContainerStyle={[
					{ padding: 16 },
					// iPad: comfortable centered column (not stretched edge-to-edge).
					isPane && { maxWidth: 560, alignSelf: "center", width: "100%" },
				]}
			>
				{/* User Avatar & Name */}
				<View style={{ alignItems: "center", marginBottom: 24, paddingVertical: 24 }}>
					<Avatar text={initials} imageUrl={user?.imageUrl} size={80} />

					<Text
						style={{
							fontSize: 20,
							fontFamily: fontFamily.bold,
							color: t.ink,
							marginTop: 16,
							marginBottom: 4,
						}}
					>
						{user?.firstName} {user?.lastName}
					</Text>
					<Text
						style={{
							fontSize: 13,
							fontFamily: fontFamily.regular,
							color: t.sub,
						}}
					>
						{user?.primaryEmailAddress?.emailAddress}
					</Text>
				</View>

				{/* Account Details */}
				<Card>
					{/* Email */}
					<View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8 }}>
						<Mail size={20} color={t.sub} />
						<View style={{ marginLeft: 16, flex: 1 }}>
							<Text style={{ fontSize: 11, fontFamily: fontFamily.regular, color: t.sub }}>
								Email
							</Text>
							<Text style={{ fontSize: 13, fontFamily: fontFamily.regular, color: t.ink }}>
								{user?.primaryEmailAddress?.emailAddress}
							</Text>
						</View>
					</View>

					{/* Organization */}
					{organization && (
						<View
							style={{
								flexDirection: "row",
								alignItems: "center",
								paddingVertical: 8,
								marginTop: 8,
								borderTopWidth: 1,
								borderTopColor: t.line,
							}}
						>
							<Building size={20} color={t.sub} />
							<View style={{ marginLeft: 16, flex: 1 }}>
								<Text style={{ fontSize: 11, fontFamily: fontFamily.regular, color: t.sub }}>
									Organization
								</Text>
								<Text style={{ fontSize: 13, fontFamily: fontFamily.regular, color: t.ink }}>
									{organization.name}
								</Text>
							</View>
						</View>
					)}

					{/* Role */}
					{membership && (
						<View
							style={{
								flexDirection: "row",
								alignItems: "center",
								paddingVertical: 8,
								marginTop: 8,
								borderTopWidth: 1,
								borderTopColor: t.line,
							}}
						>
							<Shield size={20} color={t.sub} />
							<View style={{ marginLeft: 16, flex: 1 }}>
								<Text style={{ fontSize: 11, fontFamily: fontFamily.regular, color: t.sub }}>
									Role
								</Text>
								<Text style={{ fontSize: 13, fontFamily: fontFamily.regular, color: t.ink }}>
									{membership.role.charAt(0).toUpperCase() +
										membership.role.slice(1)}
								</Text>
							</View>
						</View>
					)}
				</Card>

				{/* Sign Out Button */}
				<Pressable
					style={{
						flexDirection: "row",
						alignItems: "center",
						justifyContent: "center",
						paddingVertical: 16,
						borderRadius: radii.lg,
						marginTop: 24,
						backgroundColor: t.card,
						borderWidth: 1,
						borderColor: t.line,
					}}
					onPress={handleSignOut}
				>
					<LogOut size={20} color={t.danger} />
					<Text
						style={{
							marginLeft: 8,
							color: t.danger,
							fontFamily: fontFamily.semibold,
							fontSize: 13,
						}}
					>
						Sign Out
					</Text>
				</Pressable>

				{/* Delete Account (App Store 5.1.1(v)) — confirm-gated, backend-owner-aware */}
				<Pressable
					style={{
						flexDirection: "row",
						alignItems: "center",
						justifyContent: "center",
						paddingVertical: 16,
						borderRadius: radii.lg,
						marginTop: 12,
						backgroundColor: t.card,
						borderWidth: 1,
						borderColor: t.line,
						opacity: isDeleting || !ownershipResolved ? 0.5 : 1,
					}}
					onPress={handleDeleteAccount}
					disabled={isDeleting || !ownershipResolved}
				>
					<Trash2 size={20} color={t.danger} />
					<Text
						style={{
							marginLeft: 8,
							color: t.danger,
							fontFamily: fontFamily.semibold,
							fontSize: 13,
						}}
					>
						Delete Account
					</Text>
				</Pressable>

				{/* App Info */}
				<View style={{ alignItems: "center", marginTop: 24 }}>
					<Text style={{ fontSize: 11, fontFamily: fontFamily.regular, color: t.sub }}>
						OneTool Mobile
					</Text>
					<Text
						style={{
							fontSize: 11,
							fontFamily: fontFamily.regular,
							color: t.sub,
							marginTop: 4,
						}}
					>
						Version 1.0.0
					</Text>
				</View>
			</ScrollView>
		</SafeAreaView>
	);
}
