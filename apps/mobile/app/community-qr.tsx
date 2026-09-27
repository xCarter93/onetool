import { useCallback, useRef, useState } from "react";
import {
	ActivityIndicator,
	Image,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { useOrganization } from "@clerk/expo";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Download, Share2, X } from "lucide-react-native";
import QRCode from "react-native-qrcode-svg";
import { captureRef } from "react-native-view-shot";
import * as Brightness from "expo-brightness";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import { useKeepAwake } from "expo-keep-awake";
import { usePermissions } from "@/lib/use-permissions";
import {
	fontFamily,
	frame,
	radii,
	tracking,
	type,
	useTokens,
} from "@/lib/theme";

// Hardcoded on purpose — matches the web community route exactly. `?src=qr`
// feeds the community page's fixed source enum (P5b) so scans are attributable.
const COMMUNITY_HOST = "onetool.biz";
const QR_SIZE = 232;

function initialsFrom(name: string): string {
	const words = name.trim().split(/\s+/).filter(Boolean);
	if (words.length >= 2) {
		return (words[0][0] + words[words.length - 1][0]).toUpperCase();
	}
	return (words[0] ?? "?").slice(0, 2).toUpperCase();
}

/**
 * Full-screen graphite sheet whose one job is putting the org's community-page QR in
 * front of a customer's camera: screen goes to full brightness, stays awake, and
 * the white card can be shared or saved as a PNG. There is deliberately NO "open
 * the page" action — this screen sells scanning and sharing, never browsing.
 */
export default function CommunityQrScreen() {
	const t = useTokens();
	const insets = useSafeAreaInsets();
	const { organization } = useOrganization();
	const { can, isLoading: permsLoading } = usePermissions();

	// `communityPages.get` calls requireLevel("community", "view") and THROWS on
	// denial — an unguarded useQuery would throw during render and drop the whole
	// app into the root ErrorBoundary. Skip until we know the actor can read it.
	const canViewCommunity = can("community", "view");
	const page = useQuery(api.communityPages.get, canViewCommunity ? {} : "skip");

	const cardRef = useRef<View>(null);
	const [busy, setBusy] = useState<"share" | "save" | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);
	const [saved, setSaved] = useState(false);
	const [qrFailed, setQrFailed] = useState(false);

	// Keep the panel readable under a shop's fluorescent lights while it is up.
	useKeepAwake();

	// Full brightness on focus, prior level back on blur/unmount. The captured
	// level lives in a ref so the cleanup restores exactly what the user had.
	const priorBrightness = useRef<number | null>(null);
	useFocusEffect(
		useCallback(() => {
			let cancelled = false;
			void (async () => {
				try {
					const current = await Brightness.getBrightnessAsync();
					if (cancelled) return;
					priorBrightness.current = current;
					await Brightness.setBrightnessAsync(1);
				} catch {
					// Brightness control unavailable — the QR still scans, just dimmer.
				}
			})();
			return () => {
				cancelled = true;
				const prior = priorBrightness.current;
				priorBrightness.current = null;
				if (prior == null) {
					void Brightness.restoreSystemBrightnessAsync().catch(() => {});
					return;
				}
				void Brightness.setBrightnessAsync(prior).catch(() => {});
			};
		}, []),
	);

	const orgName = organization?.name ?? "Your business";
	const slug = page?.slug;
	const isLive = !!slug && page?.isPublic === true;
	const loading = permsLoading || (canViewCommunity && page === undefined);
	const shareUrl = slug
		? `https://${COMMUNITY_HOST}/communities/${slug}?src=qr`
		: null;

	const captureCard = async (): Promise<string> => {
		// The card is showing the fallback text, not a code — never ship that PNG.
		if (qrFailed) throw new Error("QR unavailable");
		return captureRef(cardRef, { format: "png", result: "tmpfile" });
	};

	const handleShare = async () => {
		if (busy) return;
		setBusy("share");
		setActionError(null);
		setSaved(false);
		try {
			if (!(await Sharing.isAvailableAsync())) {
				setActionError("Sharing isn't available on this device.");
				return;
			}
			const uri = await captureCard();
			// Image-only contract: the PNG carries the URL, so no text payload.
			await Sharing.shareAsync(uri, {
				mimeType: "image/png",
				UTI: "public.png",
				dialogTitle: "Share QR code",
			});
		} catch {
			setActionError("Couldn't share your code. Please try again.");
		} finally {
			setBusy(null);
		}
	};

	const handleSave = async () => {
		if (busy) return;
		setBusy("save");
		setActionError(null);
		setSaved(false);
		try {
			// writeOnly — we only ever add, never read the user's library.
			const permission = await MediaLibrary.requestPermissionsAsync(true);
			if (!permission.granted) {
				setActionError("Allow photo access in Settings to save your code.");
				return;
			}
			const uri = await captureCard();
			await MediaLibrary.Asset.create(uri);
			setSaved(true);
		} catch {
			setActionError("Couldn't save your code. Please try again.");
		} finally {
			setBusy(null);
		}
	};

	return (
		<View
			style={[
				styles.screen,
				{ backgroundColor: frame.rail, paddingTop: insets.top + 6 },
			]}
		>
			<StatusBar style="light" />

			<View style={styles.topRow}>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel="Close"
					onPress={() => router.back()}
					hitSlop={8}
					style={({ pressed }) => [
						styles.railSquare,
						{
							backgroundColor: pressed ? frame.railBorder : frame.railRaised,
							borderColor: frame.railBorder,
						},
					]}
				>
					<X size={18} color={frame.railText} strokeWidth={2} />
				</Pressable>
				<Text style={[styles.eyebrow, { color: frame.railMuted }]}>
					COMMUNITY PAGE
				</Text>
				{/* Balances the close square so the eyebrow sits centered. */}
				<View style={styles.topRowSpacer} />
			</View>

			{loading ? (
				<View style={styles.center}>
					<ActivityIndicator size="small" color={frame.railMuted} />
				</View>
			) : !isLive ? (
				<View style={styles.center}>
					<View style={styles.emptyBox}>
						<Text style={[styles.emptyTitle, { color: frame.railText }]}>
							Your community page isn&apos;t live yet
						</Text>
						<Text style={[styles.emptyBody, { color: frame.railMuted }]}>
							Set it up on the web at onetool.biz, then come back here to share
							it.
						</Text>
					</View>
				</View>
			) : (
				<>
					<View style={styles.center}>
						<View
							ref={cardRef}
							collapsable={false}
							style={[styles.card, { backgroundColor: t.card, borderColor: t.line }]}
						>
							<View style={styles.identity}>
								{organization?.imageUrl ? (
									<Image
										source={{ uri: organization.imageUrl }}
										style={styles.orgTile}
									/>
								) : (
									<LinearGradient
										colors={[t.brand, t.primarySolid]}
										start={{ x: 0, y: 0 }}
										end={{ x: 1, y: 1 }}
										style={[styles.orgTile, styles.orgTileFill]}
									>
										<Text style={styles.orgTileText}>
											{initialsFrom(orgName)}
										</Text>
									</LinearGradient>
								)}
								<Text numberOfLines={1} style={[styles.orgName, { color: t.ink }]}>
									{orgName}
								</Text>
							</View>

							<View style={styles.qrWell}>
								{qrFailed || !shareUrl ? (
									<Text style={[styles.qrFallback, { color: t.sub }]}>
										Couldn&apos;t draw this code. Close and reopen this screen.
									</Text>
								) : (
									<QRCode
										value={shareUrl}
										size={QR_SIZE}
										color="#000000"
										backgroundColor="#ffffff"
										quietZone={8}
										ecl="M"
										onError={() => setQrFailed(true)}
									/>
								)}
							</View>

							<Text numberOfLines={1} style={[styles.caption, { color: t.sub }]}>
								{`${COMMUNITY_HOST}/communities/${slug}`}
							</Text>
						</View>

						<Text style={[styles.helper, { color: frame.railMuted }]}>
							Customers scan this code to open your community page.
						</Text>
					</View>

					<View style={[styles.actions, { paddingBottom: insets.bottom + 16 }]}>
						{actionError ? (
							<Text style={[styles.actionError, { color: frame.railDanger }]}>
								{actionError}
							</Text>
						) : saved ? (
							<Text style={[styles.actionOk, { color: frame.railSuccess }]}>
								Saved to Photos
							</Text>
						) : null}

						<View style={styles.actionRow}>
							<View style={styles.actionCol}>
								<Pressable
									onPress={() => void handleShare()}
									disabled={busy !== null || qrFailed}
									accessibilityRole="button"
									accessibilityLabel="Share QR code"
									style={({ pressed }) => [
										styles.railSquareLg,
										{
											backgroundColor: pressed ? frame.railBorder : frame.railRaised,
											borderColor: frame.railBorder,
										},
										(busy !== null || qrFailed) && styles.dimmed,
									]}
								>
									{busy === "share" ? (
										<ActivityIndicator color={frame.railText} />
									) : (
										<Share2 size={20} color={frame.railText} strokeWidth={2} />
									)}
								</Pressable>
								<Text style={[styles.actionLabel, { color: frame.railMuted }]}>
									Share
								</Text>
							</View>
							<View style={styles.actionCol}>
								<Pressable
									onPress={() => void handleSave()}
									disabled={busy !== null || qrFailed}
									accessibilityRole="button"
									accessibilityLabel="Save to Photos"
									style={({ pressed }) => [
										styles.railSquareLg,
										{
											backgroundColor: pressed ? frame.railBorder : frame.railRaised,
											borderColor: frame.railBorder,
										},
										(busy !== null || qrFailed) && styles.dimmed,
									]}
								>
									{busy === "save" ? (
										<ActivityIndicator color={frame.railText} />
									) : (
										<Download size={20} color={frame.railText} strokeWidth={2} />
									)}
								</Pressable>
								<Text style={[styles.actionLabel, { color: frame.railMuted }]}>
									Save
								</Text>
							</View>
						</View>
					</View>
				</>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
		paddingHorizontal: 20,
	},
	topRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	railSquare: {
		width: 36,
		height: 36,
		borderRadius: radii.ctrl,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	topRowSpacer: {
		width: 36,
	},
	eyebrow: {
		flex: 1,
		textAlign: "center",
		fontFamily: fontFamily.semibold,
		fontSize: type.eyebrow,
		letterSpacing: tracking.eyebrow,
	},
	center: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 18,
	},
	card: {
		borderRadius: radii.card,
		borderWidth: 1,
		paddingHorizontal: 24,
		paddingTop: 20,
		paddingBottom: 18,
		alignItems: "center",
		gap: 16,
	},
	identity: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		maxWidth: QR_SIZE,
	},
	orgTile: {
		width: 34,
		height: 34,
		borderRadius: 9,
	},
	orgTileFill: {
		alignItems: "center",
		justifyContent: "center",
	},
	orgTileText: {
		fontFamily: fontFamily.bold,
		fontSize: 13,
		color: "#ffffff",
	},
	orgName: {
		flexShrink: 1,
		fontFamily: fontFamily.semibold,
		fontSize: type.h3,
	},
	qrWell: {
		width: QR_SIZE,
		height: QR_SIZE,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#ffffff",
	},
	qrFallback: {
		fontFamily: fontFamily.regular,
		fontSize: type.sm,
		textAlign: "center",
	},
	caption: {
		maxWidth: QR_SIZE,
		fontFamily: fontFamily.medium,
		fontSize: type.meta,
	},
	helper: {
		maxWidth: 300,
		textAlign: "center",
		fontFamily: fontFamily.regular,
		fontSize: type.body,
	},
	emptyBox: {
		maxWidth: 320,
		alignItems: "center",
		gap: 8,
	},
	emptyTitle: {
		textAlign: "center",
		fontFamily: fontFamily.semibold,
		fontSize: type.h2,
	},
	emptyBody: {
		textAlign: "center",
		fontFamily: fontFamily.regular,
		fontSize: type.body,
	},
	actions: {
		gap: 10,
	},
	actionError: {
		textAlign: "center",
		fontFamily: fontFamily.medium,
		fontSize: type.sm,
	},
	actionOk: {
		textAlign: "center",
		fontFamily: fontFamily.medium,
		fontSize: type.sm,
	},
	actionRow: {
		flexDirection: "row",
		justifyContent: "center",
		gap: 28,
	},
	actionCol: {
		alignItems: "center",
		gap: 6,
	},
	railSquareLg: {
		width: 52,
		height: 52,
		borderRadius: radii.ctrl,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	actionLabel: {
		fontFamily: fontFamily.medium,
		fontSize: type.xs,
	},
	dimmed: {
		opacity: 0.6,
	},
});
