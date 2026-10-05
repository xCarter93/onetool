import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useUser, useAuth, useOrganization } from "@clerk/expo";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { fontFamily, useTokens } from "@/lib/theme";
import { Avatar } from "@/components/ui";
import { CanvasScroll, PageHeader, Panel, RecordRow, SectionLabel } from "@/components/canvas";
import { useRouter, type Href } from "expo-router";
import {
	Building,
	LogOut,
	Trash2,
	Bell,
	QrCode,
	MessageCircle,
	Bug,
	Lightbulb,
	type LucideIcon,
} from "lucide-react-native";
import { usePermissions } from "@/lib/use-permissions";
import { openExternal } from "@/lib/open-external";
import { useOffline } from "@/lib/offline/OfflineProvider";
import { clearPartition } from "@/lib/offline/store";
import { discardPaymentWarning, signOutGuardMessage, summarizePendingOps } from "@/lib/offline/sync-copy";
import { useShellNav } from "@/lib/shell-nav";

const SUPPORT_EMAIL = "support@onetool.biz";

/** Subject carries "(mobile)" — the support inbox tags mobile mail on it. */
function supportMailto(subject: string, body: string): string {
	return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Clerk roles are "org:admin" / "org:member" — show "Admin" / "Member". */
function formatRole(role: string): string {
	const bare = role.replace(/^org:/, "");
	return bare.charAt(0).toUpperCase() + bare.slice(1);
}

/** A destructive nav row: same row shape as RecordRow, danger-tinted, no chevron. */
function DangerRow({
	icon: Icon,
	label,
	onPress,
	disabled,
}: {
	icon: LucideIcon;
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
			accessibilityState={{ disabled: !!disabled }}
			style={({ pressed }) => [
				styles.dangerRow,
				pressed && !disabled && { backgroundColor: t.muted },
				disabled && styles.disabled,
			]}
		>
			<Icon size={18} color={t.danger} strokeWidth={2} />
			<Text style={[styles.dangerLabel, { color: t.danger }]}>{label}</Text>
		</Pressable>
	);
}

// headerMode defaults to "root" → the iPhone path (own page header, edge-to-edge
// content) is byte-identical. The iPad shell renders Profile as a single pane:
// headerMode="pane" suppresses the page header (the shell mounts the one
// PaneHeader) and the content is bounded to a centered column so it is not
// stretched edge-to-edge.
export default function ProfileScreen({
	headerMode = "root",
}: {
	headerMode?: "root" | "pane";
} = {}) {
	const { user } = useUser();
	const { signOut } = useAuth();
	const router = useRouter();
	const { organization, membership } = useOrganization();
	const { partition, ops } = useOffline();
	const t = useTokens();
	const isPane = headerMode === "pane";
	const shellNav = useShellNav();

	// TRUE ownership comes from the BACKEND (Convex), NOT the Clerk org:admin role —
	// a co-admin who is not the org owner must take the member path.
	const { can, isLoading: permsLoading } = usePermissions();
	// The QR screen reads the community page, which requires community:view —
	// without it the destination only ever shows "isn't live yet". Visible while
	// perms load so the row doesn't pop in under a tap.
	const showQr = permsLoading || can("community", "view");

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

	// Deletes cached reads always; only wipes the outbox when the caller confirmed
	// discarding pending work (§4.5 partition contract).
	const finishSignOut = async (discardOutbox: boolean) => {
		if (partition) await clearPartition(partition, discardOutbox);
		await signOut();
	};

	const handleSignOut = () => {
		const pending = summarizePendingOps(ops);
		if (pending.count === 0) {
			Alert.alert("Sign Out", "Are you sure you want to sign out?", [
				{ text: "Cancel", style: "cancel" },
				{ text: "Sign Out", style: "destructive", onPress: () => void finishSignOut(false) },
			]);
			return;
		}
		Alert.alert("Unsynced changes on this phone", signOutGuardMessage(pending), [
			{ text: "Stay signed in", style: "cancel" },
			{
				text: "Discard and sign out",
				style: "destructive",
				onPress: () => {
					if (pending.paymentCount === 0) {
						void finishSignOut(true);
						return;
					}
					Alert.alert(
						"This will discard recorded payments",
						discardPaymentWarning(pending.paymentCount),
						[
							{ text: "Cancel", style: "cancel" },
							{ text: "Discard anyway", style: "destructive", onPress: () => void finishSignOut(true) },
						],
					);
				},
			},
		]);
	};

	// The actual delete flow, run once any pending-work guard below has cleared.
	const proceedWithDeleteAccount = (discardOutbox: boolean) => {
		// Three-way confirm copy chosen by path BEFORE the Alert.
		let message: string;
		if (isOwner && otherMembers === 0) {
			message =
				"This permanently deletes your account and your entire organization, including all clients, projects, quotes and invoices. This cannot be undone.";
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
					// Only after the final confirm: cancelling must leave local work intact.
					if (partition) await clearPartition(partition, discardOutbox);

					// Owner path: destroy the org FIRST (fires organization.deleted →
					// the backend cascade erases all org data; child rows drain
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

	const handleDeleteAccount = () => {
		if (isDeleting || !ownershipResolved) return;
		const pending = summarizePendingOps(ops);
		if (pending.count === 0) {
			proceedWithDeleteAccount(false);
			return;
		}
		Alert.alert("Unsynced changes on this phone", signOutGuardMessage(pending), [
			{ text: "Cancel", style: "cancel" },
			{
				text: "Discard and continue",
				style: "destructive",
				onPress: () => {
					const discard = () => proceedWithDeleteAccount(true);
					if (pending.paymentCount === 0) {
						discard();
						return;
					}
					Alert.alert(
						"This will discard recorded payments",
						discardPaymentWarning(pending.paymentCount),
						[
							{ text: "Cancel", style: "cancel" },
							{ text: "Discard anyway", style: "destructive", onPress: discard },
						],
					);
				},
			},
		]);
	};

	const initials =
		user?.firstName?.[0] ||
		user?.emailAddresses[0]?.emailAddress[0]?.toUpperCase() ||
		"?";

	return (
		<View style={styles.screen}>
			<CanvasScroll contentContainerStyle={isPane ? styles.paneContent : undefined}>
				{isPane ? null : <PageHeader title="Profile" />}
				<Panel>
					<View style={styles.identity}>
						<Avatar text={initials} imageUrl={user?.imageUrl} size={64} />
						<View style={styles.identityText}>
							<Text style={[styles.name, { color: t.ink }]} numberOfLines={1}>
								{user?.firstName} {user?.lastName}
							</Text>
							<Text style={[styles.email, { color: t.sub }]} numberOfLines={1}>
								{user?.primaryEmailAddress?.emailAddress}
							</Text>
							{membership ? (
								<Text style={[styles.role, { color: t.sub }]}>{formatRole(membership.role)}</Text>
							) : null}
						</View>
					</View>
				</Panel>

				{/* Business details is owner-only (backend gates the save to the owner).
				    Edits the existing org's profile; never creates an org. Share QR sells
				    SHARING the code, never "open the page". */}
				{isOwner || showQr ? (
					<View style={styles.section}>
						<SectionLabel title="Organization" />
						<Panel>
							{isOwner ? (
								<RecordRow
									leading={<Building size={18} color={t.sub} strokeWidth={2} />}
									title="Business details"
									onPress={() =>
										shellNav
											? shellNav.openBusinessDetails()
											: router.push("/business-details" as Href)
									}
								/>
							) : null}
							{showQr ? (
								<RecordRow
									leading={<QrCode size={18} color={t.sub} strokeWidth={2} />}
									title="Share QR code"
									subtitle="Customers scan it to find your community page"
									onPress={() => router.push("/community-qr" as Href)}
								/>
							) : null}
						</Panel>
					</View>
				) : null}

				<View style={styles.section}>
					<SectionLabel title="Preferences" />
					<Panel>
						<RecordRow
							leading={<Bell size={18} color={t.sub} strokeWidth={2} />}
							title="Notifications"
							onPress={() => router.push("/notification-preferences" as Href)}
						/>
					</Panel>
				</View>

				{/* Support — mailto rows (no PostHog RN SDK; email is the mobile channel).
				    Prefilled subjects carry "(mobile)" so tickets get tagged; bodies
				    prompt the same two bug questions the web form asks. */}
				<View style={styles.section}>
					<SectionLabel title="Support" />
					<Panel>
						<RecordRow
							leading={<MessageCircle size={18} color={t.sub} strokeWidth={2} />}
							title="Contact support"
							subtitle="We reply within one business day"
							onPress={() =>
								openExternal(
									supportMailto(
										"Support request (mobile)",
										`How can we help?\n\n\n—\nOrganization: ${organization?.name ?? ""}\nOneTool Mobile`,
									),
									"Mail",
								)
							}
						/>
						<RecordRow
							leading={<Bug size={18} color={t.sub} strokeWidth={2} />}
							title="Report a bug"
							subtitle="Something broken or not working right"
							onPress={() =>
								openExternal(
									supportMailto(
										"Bug report (mobile)",
										`What were you trying to do?\n\n\nWhat happened instead?\n\n\n—\nOrganization: ${organization?.name ?? ""}\nOneTool Mobile`,
									),
									"Mail",
								)
							}
						/>
						<RecordRow
							leading={<Lightbulb size={18} color={t.sub} strokeWidth={2} />}
							title="Request a feature"
							subtitle="Tell us what OneTool should do next"
							onPress={() =>
								openExternal(
									supportMailto(
										"Feature request (mobile)",
										`What would you like OneTool to do?\n\n\n—\nOrganization: ${organization?.name ?? ""}\nOneTool Mobile`,
									),
									"Mail",
								)
							}
						/>
					</Panel>
				</View>

				<View style={styles.section}>
					<SectionLabel title="Account" />
					<Panel>
						<DangerRow icon={LogOut} label="Sign out" onPress={handleSignOut} />
						<DangerRow
							icon={Trash2}
							label="Delete account"
							onPress={handleDeleteAccount}
							disabled={isDeleting || !ownershipResolved}
						/>
					</Panel>
				</View>

				<Text style={[styles.footer, { color: t.sub }]}>OneTool Mobile</Text>
			</CanvasScroll>
		</View>
	);
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
	},
	paneContent: {
		maxWidth: 560,
		alignSelf: "center",
		width: "100%",
	},
	identity: {
		flexDirection: "row",
		alignItems: "center",
		gap: 14,
		padding: 14,
	},
	identityText: {
		flex: 1,
		minWidth: 0,
		gap: 2,
	},
	name: {
		fontFamily: fontFamily.semibold,
		fontSize: 16,
	},
	email: {
		fontFamily: fontFamily.regular,
		fontSize: 13,
	},
	role: {
		fontFamily: fontFamily.medium,
		fontSize: 12,
	},
	section: {
		gap: 8,
	},
	dangerRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 11,
		minHeight: 56,
		paddingVertical: 11,
		paddingHorizontal: 12,
	},
	dangerLabel: {
		fontFamily: fontFamily.semibold,
		fontSize: 14,
	},
	disabled: {
		opacity: 0.5,
	},
	footer: {
		fontFamily: fontFamily.regular,
		fontSize: 11,
		textAlign: "center",
		marginTop: 4,
	},
});
