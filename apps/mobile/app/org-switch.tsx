import {
	View,
	Text,
	Pressable,
	ActivityIndicator,
	Alert,
	StyleSheet,
	ScrollView,
} from "react-native";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { useOrganizationList, useOrganization } from "@clerk/expo";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, Building, RefreshCw, X } from "lucide-react-native";
import { fontFamily, radii, spacing, touch, type, useTokens } from "@/lib/theme";
import { Avatar } from "@/components/ui";
import { Panel } from "@/components/canvas";
import { CenteredModal } from "@/components/ipad/centered-modal";
import { useDevice } from "@/lib/use-device";
import { useOffline } from "@/lib/offline/OfflineProvider";
import { orgSwitchPendingMessage, summarizePendingOps } from "@/lib/offline/sync-copy";

const MEMBERSHIP_PAGE_SIZE = 25;

function formatRole(role: string): string {
	const normalized = role.replace(/^org:/, "").replace(/[_-]/g, " ");
	return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

// Org switcher form-sheet body. Sheet chrome (detents/grabber) comes from the
// Stack.Screen options in _layout.tsx — this file is the content only. The
// ConvexProvider key-reinit in _layout.tsx re-scopes every query on org change.
export default function OrgSwitchSheet() {
	const t = useTokens();
	const insets = useSafeAreaInsets();
	const { device } = useDevice();
	const { ops } = useOffline();
	const { userMemberships, setActive, isLoaded } = useOrganizationList({
		userMemberships: {
			infinite: true,
			keepPreviousData: true,
			pageSize: MEMBERSHIP_PAGE_SIZE,
		},
	});
	const { organization: activeOrg } = useOrganization();
	// Per-org fallback to initials on a failed logo load, not just missing imageUrl.
	const [failedOrgLogos, setFailedOrgLogos] = useState<Set<string>>(new Set());
	const [switching, setSwitching] = useState(false);

	const organizationList = userMemberships.data ?? [];
	const membershipIsLoading = Boolean(userMemberships.isLoading);
	const membershipIsFetching = Boolean(userMemberships.isFetching);
	const membershipIsError = Boolean(userMemberships.isError);
	const hasNextMembershipPage = Boolean(userMemberships.hasNextPage);
	const loadingMemberships =
		!isLoaded || (membershipIsLoading && organizationList.length === 0);

	useEffect(() => {
		if (!isLoaded || !hasNextMembershipPage || membershipIsFetching) return;
		userMemberships.fetchNext?.();
	}, [
		isLoaded,
		hasNextMembershipPage,
		membershipIsFetching,
		userMemberships.fetchNext,
	]);

	const runOrgSwitch = async (orgId: string) => {
		try {
			setSwitching(true);

			// Switch the active organization in Clerk
			if (!setActive) {
				throw new Error("Clerk is not ready to switch organizations.");
			}
			await setActive({ organization: orgId });

			// Settle so Clerk finishes updating before the ConvexProvider key-reinit fires
			await new Promise((resolve) => setTimeout(resolve, 500));

			// Land on Today: every role can see it, unlike whatever screen was open.
			router.dismissTo("/");
		} catch (error) {
			console.error("Failed to switch organization:", error);
			Alert.alert("Error", "Failed to switch organization. Please try again.", [
				{ text: "OK" },
			]);
		} finally {
			setSwitching(false);
		}
	};

	// Switching never blocks on pending work — the outbox drains this org's
	// queue whenever it's next active and online (§4.5). Just say so.
	const handleOrgSwitch = (orgId: string) => {
		const pendingNotice = orgSwitchPendingMessage(summarizePendingOps(ops));
		if (!pendingNotice) {
			void runOrgSwitch(orgId);
			return;
		}
		Alert.alert("Unsynced changes here", pendingNotice, [
			{ text: "Stay here", style: "cancel" },
			{ text: "Switch organization", onPress: () => void runOrgSwitch(orgId) },
		]);
	};

	const content = (
		<>
			<View style={[styles.header, { borderBottomColor: t.line }]}>
				<View style={[styles.tile, { backgroundColor: t.secondary }]}>
					<Building size={18} color={t.frostedInk} strokeWidth={2} />
				</View>
				<View style={styles.headerText}>
					<Text style={[styles.title, { color: t.ink }]} accessibilityRole="header">
						Switch organization
					</Text>
				</View>
				<Pressable
					onPress={() => router.back()}
					hitSlop={8}
					accessibilityRole="button"
					accessibilityLabel="Close"
					style={({ pressed }) => [styles.headerBtn, pressed && { backgroundColor: t.secondary }]}
				>
					<X size={20} color={t.sub} strokeWidth={2} />
				</Pressable>
			</View>

			{loadingMemberships ? (
				<View style={styles.state}>
					<ActivityIndicator size="small" color={t.sub} />
				</View>
			) : membershipIsError ? (
				<View style={styles.state}>
					<Building size={42} color={t.faint} />
					<Text style={[styles.emptyTitle, { color: t.ink }]}>
						Unable to load organizations
					</Text>
					<Text style={[styles.emptySub, { color: t.sub }]}>
						Check your connection and try again.
					</Text>
					<Pressable
						onPress={() => void userMemberships.revalidate?.()}
						style={({ pressed }) => [
							styles.retryButton,
							{
								backgroundColor: pressed ? t.frostedBgPressed : t.frostedBg,
							},
						]}
					>
						<RefreshCw size={16} color={t.frostedInk} />
						<Text style={[styles.retryText, { color: t.frostedInk }]}>Retry</Text>
					</Pressable>
				</View>
			) : (
				<ScrollView
					style={styles.list}
					contentContainerStyle={[
						styles.listContent,
						organizationList.length === 0 && styles.emptyListContent,
					]}
					showsVerticalScrollIndicator={organizationList.length > 6}
				>
					{organizationList.length > 0 ? (
						<Panel>
							{organizationList.map((membership) => {
								const org = membership.organization;
								const isActive = org.id === activeOrg?.id;
								const role = formatRole(membership.role ?? "member");

								return (
									<Pressable
										key={org.id}
										onPress={() => handleOrgSwitch(org.id)}
										disabled={switching || isActive}
										style={({ pressed }) => [
											styles.row,
											isActive && { backgroundColor: t.frostedBg },
											!isActive && pressed && { backgroundColor: t.muted },
										]}
									>
										<View style={styles.rowLeft}>
											{org.imageUrl && !failedOrgLogos.has(org.id) ? (
												<Image
													source={{ uri: org.imageUrl }}
													style={styles.orgImage}
													contentFit="cover"
													cachePolicy="disk"
													transition={150}
													onError={() =>
														setFailedOrgLogos((prev) => new Set(prev).add(org.id))
													}
												/>
											) : (
												<Avatar text={(org.name || "O").slice(0, 2)} size={40} />
											)}
											<View style={styles.rowText}>
												<Text
													style={[
														styles.orgName,
														{
															color: t.ink,
															fontFamily: isActive
																? fontFamily.semibold
																: fontFamily.regular,
														},
													]}
													numberOfLines={1}
												>
													{org.name}
												</Text>
												<Text style={[styles.role, { color: t.sub }]}>
													{role}
												</Text>
											</View>
										</View>
										{isActive && <Check size={20} color={t.frostedInk} />}
									</Pressable>
								);
							})}
						</Panel>
					) : (
						<View style={styles.empty}>
							<Building size={48} color={t.faint} />
							<Text style={[styles.emptyTitle, { color: t.ink }]}>
								No organizations found
							</Text>
							<Text style={[styles.emptySub, { color: t.sub }]}>
								You can create one from the web app.
							</Text>
						</View>
					)}

					{membershipIsFetching && organizationList.length > 0 ? (
						<View style={styles.loadingMore}>
							<ActivityIndicator size="small" color={t.sub} />
						</View>
					) : null}
				</ScrollView>
			)}

			{switching && (
				<View
					style={[
						StyleSheet.absoluteFill,
						styles.overlay,
						{ backgroundColor: t.card },
					]}
				>
					<ActivityIndicator size="large" color={t.sub} />
					<Text style={[styles.overlayText, { color: t.ink }]}>
						Switching organization...
					</Text>
				</View>
			)}
		</>
	);

	// iPad (Strategy B): centered card; maxHeight 86% so a long org list scrolls within it.
	if (device === "ipad") {
		return (
			<CenteredModal onScrimPress={() => router.back()} maxHeight="86%">
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
				{
					backgroundColor: t.card,
					paddingBottom: insets.bottom,
				},
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
		borderTopLeftRadius: radii.sheet,
		borderTopRightRadius: radii.sheet,
		overflow: "hidden",
	},
	// iPad card (CenteredModal supplies the shell + radius + definite height).
	// flex:1 (not flexShrink) so the body's flex:1 list/state resolves a basis.
	padCard: {
		flex: 1,
		paddingTop: spacing.gutter,
	},
	grabber: {
		alignSelf: "center",
		width: 44,
		height: 5,
		borderRadius: radii.pill,
		marginTop: 10,
		marginBottom: spacing.md,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingHorizontal: spacing.md,
		paddingBottom: 14,
		borderBottomWidth: 1,
	},
	tile: {
		width: 36,
		height: 36,
		borderRadius: radii.ctrl,
		alignItems: "center",
		justifyContent: "center",
	},
	headerText: {
		flex: 1,
		minWidth: 0,
	},
	title: {
		fontSize: type.h3,
		fontFamily: fontFamily.semibold,
	},
	headerBtn: {
		width: 36,
		height: 36,
		borderRadius: radii.ctrl,
		alignItems: "center",
		justifyContent: "center",
	},
	state: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: spacing.xl,
		gap: 10,
	},
	list: {
		flex: 1,
	},
	listContent: {
		paddingHorizontal: spacing.md,
		paddingTop: spacing.md,
		paddingBottom: spacing.lg,
	},
	emptyListContent: {
		flexGrow: 1,
		justifyContent: "center",
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 12,
		paddingVertical: 11,
		minHeight: 56,
	},
	rowLeft: {
		flexDirection: "row",
		alignItems: "center",
		flex: 1,
		gap: 12,
	},
	orgImage: {
		width: 40,
		height: 40,
		borderRadius: radii.card,
	},
	rowText: {
		flex: 1,
	},
	orgName: {
		fontSize: type.body,
	},
	role: {
		fontSize: type.xs,
		fontFamily: fontFamily.regular,
		marginTop: 2,
	},
	empty: {
		alignItems: "center",
		paddingVertical: 48,
		gap: spacing.sm,
	},
	emptyTitle: {
		fontSize: type.body,
		fontFamily: fontFamily.semibold,
		marginTop: spacing.sm,
		textAlign: "center",
	},
	emptySub: {
		fontSize: type.xs,
		fontFamily: fontFamily.regular,
		textAlign: "center",
	},
	retryButton: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderRadius: radii.pill,
		paddingHorizontal: 14,
		paddingVertical: 10,
		minHeight: touch.min,
		marginTop: spacing.sm,
	},
	retryText: {
		fontSize: type.sm,
		fontFamily: fontFamily.semibold,
	},
	loadingMore: {
		alignItems: "center",
		paddingVertical: 12,
	},
	overlay: {
		alignItems: "center",
		justifyContent: "center",
		gap: 12,
	},
	overlayText: {
		fontSize: type.body,
		fontFamily: fontFamily.medium,
	},
});
