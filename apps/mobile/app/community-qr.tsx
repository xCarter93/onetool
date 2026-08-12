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
import { DotGrid } from "@/components/ui";
import { InkIconButton } from "@/components/ink-header-cluster";
import { usePermissions } from "@/lib/use-permissions";
import {
	dock,
	fontFamily,
	hero,
	radii,
	tokens,
	tracking,
	type,
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
 * Full-screen ink sheet whose one job is putting the org's community-page QR in
 * front of a customer's camera: screen goes to full brightness, stays awake, and
 * the white card can be shared or saved as a PNG. There is deliberately NO "open
 * the page" action — this screen sells scanning and sharing, never browsing.
 */
export default function CommunityQrScreen() {
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

	const captureCard = async (): Promise<string> =>
		captureRef(cardRef, { format: "png", result: "tmpfile" });

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
		<View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
			<StatusBar style="light" />
			<DotGrid style={StyleSheet.absoluteFill} color={hero.dotGrid} />

			<View style={styles.topRow}>
				<InkIconButton label="Close" onPress={() => router.back()}>
					<X size={18} color={hero.text} strokeWidth={2} />
				</InkIconButton>
				<Text style={styles.eyebrow}>COMMUNITY PAGE</Text>
				{/* Balances the close circle so the eyebrow sits centered. */}
				<View style={styles.topRowSpacer} />
			</View>

			{loading ? (
				<View style={styles.center}>
					<ActivityIndicator size="small" color={hero.textMid} />
				</View>
			) : !isLive ? (
				<View style={styles.center}>
					<View style={styles.emptyBox}>
						<Text style={styles.emptyTitle}>
							Your community page isn&apos;t live yet
						</Text>
						<Text style={styles.emptyBody}>
							Set it up on the web at onetool.biz, then come back here to share
							it.
						</Text>
					</View>
				</View>
			) : (
				<>
					<View style={styles.center}>
						<View ref={cardRef} collapsable={false} style={styles.card}>
							<View style={styles.identity}>
								{organization?.imageUrl ? (
									<Image
										source={{ uri: organization.imageUrl }}
										style={styles.orgTile}
									/>
								) : (
									<LinearGradient
										colors={[tokens.brand, tokens.primarySolid]}
										start={{ x: 0, y: 0 }}
										end={{ x: 1, y: 1 }}
										style={[styles.orgTile, styles.orgTileFill]}
									>
										<Text style={styles.orgTileText}>
											{initialsFrom(orgName)}
										</Text>
									</LinearGradient>
								)}
								<Text numberOfLines={1} style={styles.orgName}>
									{orgName}
								</Text>
							</View>

							<View style={styles.qrWell}>
								{qrFailed || !shareUrl ? (
									<Text style={styles.qrFallback}>
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

							<Text numberOfLines={1} style={styles.caption}>
								{`${COMMUNITY_HOST}/communities/${slug}`}
							</Text>
						</View>

						<Text style={styles.helper}>
							Customers scan this code to open your community page.
						</Text>
					</View>

					<View
						style={[styles.actions, { paddingBottom: insets.bottom + 16 }]}
					>
						{actionError ? (
							<Text style={styles.actionError}>{actionError}</Text>
						) : saved ? (
							<Text style={styles.actionOk}>Saved to Photos</Text>
						) : null}

						<Pressable
							onPress={() => void handleShare()}
							disabled={busy !== null}
							accessibilityRole="button"
							accessibilityLabel="Share QR code"
							style={({ pressed }) => [
								styles.primaryWrap,
								(pressed || busy !== null) && styles.dimmed,
							]}
						>
							<LinearGradient
								colors={dock.orbGradient}
								start={{ x: 0, y: 0 }}
								end={{ x: 1, y: 1 }}
								style={styles.primary}
							>
								{busy === "share" ? (
									<ActivityIndicator color={hero.text} />
								) : (
									<>
										<Share2 size={18} color={hero.text} strokeWidth={2} />
										<Text style={styles.primaryLabel}>Share QR code</Text>
									</>
								)}
							</LinearGradient>
						</Pressable>

						<Pressable
							onPress={() => void handleSave()}
							disabled={busy !== null}
							accessibilityRole="button"
							accessibilityLabel="Save to Photos"
							style={({ pressed }) => [
								styles.secondary,
								(pressed || busy !== null) && styles.dimmed,
							]}
						>
							{busy === "save" ? (
								<ActivityIndicator color={hero.textStrong} />
							) : (
								<>
									<Download size={18} color={hero.textStrong} strokeWidth={2} />
									<Text style={styles.secondaryLabel}>Save to Photos</Text>
								</>
							)}
						</Pressable>
					</View>
				</>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
		backgroundColor: hero.ink,
		paddingHorizontal: 20,
	},
	topRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
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
		color: hero.textDim,
	},
	center: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 18,
	},
	card: {
		backgroundColor: tokens.card,
		borderRadius: radii.card,
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
		color: hero.text,
	},
	orgName: {
		flexShrink: 1,
		fontFamily: fontFamily.semibold,
		fontSize: type.h3,
		color: tokens.ink,
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
		color: tokens.sub,
		textAlign: "center",
	},
	caption: {
		maxWidth: QR_SIZE,
		fontFamily: fontFamily.medium,
		fontSize: type.meta,
		color: tokens.sub,
	},
	helper: {
		maxWidth: 300,
		textAlign: "center",
		fontFamily: fontFamily.regular,
		fontSize: type.body,
		color: hero.textMid,
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
		color: hero.textStrong,
	},
	emptyBody: {
		textAlign: "center",
		fontFamily: fontFamily.regular,
		fontSize: type.body,
		color: hero.textMid,
	},
	actions: {
		gap: 10,
	},
	actionError: {
		textAlign: "center",
		fontFamily: fontFamily.medium,
		fontSize: type.sm,
		color: hero.alertDot,
	},
	actionOk: {
		textAlign: "center",
		fontFamily: fontFamily.medium,
		fontSize: type.sm,
		color: hero.statAccent,
	},
	primaryWrap: {
		borderRadius: 14,
		overflow: "hidden",
	},
	primary: {
		height: 50,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
	},
	primaryLabel: {
		fontFamily: fontFamily.semibold,
		fontSize: 15.5,
		color: hero.text,
	},
	secondary: {
		height: 48,
		borderRadius: 14,
		borderWidth: 1,
		borderColor: hero.buttonBorder,
		backgroundColor: hero.buttonBg,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
	},
	secondaryLabel: {
		fontFamily: fontFamily.medium,
		fontSize: 14.5,
		color: hero.textStrong,
	},
	dimmed: {
		opacity: 0.6,
	},
});
