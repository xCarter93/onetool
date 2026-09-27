import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import {
	ActivityIndicator,
	Alert,
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
	type LayoutChangeEvent,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAction } from "convex/react";
import * as Device from "expo-device";
import { Check, User } from "lucide-react-native";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { fontFamily, tracking, type, useTokens } from "@/lib/theme";
import { EmptyPanel, Panel, PanelHeader, RecordRow } from "@/components/canvas";
import { Button } from "@/components/ui";
import {
	SignaturePad,
	buildSignatureSvg,
	type SignatureStroke,
} from "@/components/signature/signature-pad";
import { useCachedQuery } from "@/lib/offline/useCachedQuery";
import { useOffline } from "@/lib/offline/OfflineProvider";
import { saveOffline } from "@/lib/offline/hooks";
import { writeDurableText } from "@/lib/offline/files";
import { canSignOffline } from "@/lib/offline/quote-signing";
import { usePermissions } from "@/lib/use-permissions";
import { useDevice } from "@/lib/use-device";

// In-person signature flow: pick the signer, then capture the signature. A
// light full-screen page (no shell) since the client is looking at the phone
// directly. Phone rotates the signing surface 90° (Jobber's pattern — a wide
// canvas without orientation-lock complexity); iPad is already wide, so it
// signs unrotated. No Skip: if the client can't sign now, the resend path
// covers it.

export default function SignQuoteScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const t = useTokens();
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const { device } = useDevice();
	const { online } = useOffline();
	const { can } = usePermissions();

	const quote = useCachedQuery(
		api.quotes.get,
		id ? { id: id as Id<"quotes"> } : "skip"
	);
	const contacts = useCachedQuery(
		api.clientContacts.listByClient,
		quote ? { clientId: quote.clientId } : "skip"
	);
	// Offline eligibility (PRD §3 Tier 4 item 2): a current, server-snapshotted
	// cached document stands in for the online ensureQuotePdf step.
	const latestDoc = useCachedQuery(
		api.documents.getLatest,
		quote && can("documents", "view")
			? { documentType: "quote" as const, documentId: id }
			: "skip"
	);

	const ensureQuotePdf = useAction(api.pdfActions.ensureQuotePdf);

	const [step, setStep] = useState<"signer" | "canvas">("signer");
	const [contactId, setContactId] = useState<Id<"clientContacts"> | null>(
		null
	);
	const [strokes, setStrokes] = useState<SignatureStroke[]>([]);
	const [submitting, setSubmitting] = useState(false);
	const [padSize, setPadSize] = useState<{ w: number; h: number } | null>(
		null
	);

	// The audit row pins a PDF; render one in the background while the signer
	// is being picked so Confirm doesn't wait on it. Online only — offline uses
	// the cached document instead (below), and an action never resolves offline.
	const pdfPromise = useRef<Promise<Id<"documents">> | null>(null);
	const ensurePdf = useCallback((): Promise<Id<"documents">> => {
		if (!pdfPromise.current) {
			pdfPromise.current = ensureQuotePdf({
				quoteId: id as Id<"quotes">,
			}).catch((err) => {
				pdfPromise.current = null; // allow retry on the next call
				throw err;
			});
		}
		return pdfPromise.current;
	}, [ensureQuotePdf, id]);
	const kickPdf = useCallback(() => {
		if (online) void ensurePdf().catch(() => {});
	}, [online, ensurePdf]);

	const sortedContacts = useMemo(() => {
		if (!contacts) return undefined;
		return [...contacts].sort(
			(a, b) => Number(b.isPrimary) - Number(a.isPrimary)
		);
	}, [contacts]);

	// Default the signer to the primary contact once contacts arrive.
	const primaryId = sortedContacts?.find((c) => c.isPrimary)?._id ?? null;
	const selectedId = contactId ?? primaryId ?? sortedContacts?.[0]?._id ?? null;
	const selected = sortedContacts?.find((c) => c._id === selectedId) ?? null;
	const signerName = selected
		? `${selected.firstName} ${selected.lastName}`.trim()
		: "the client";

	const confirm = async () => {
		if (!quote || !selectedId || strokes.length === 0 || !padSize) return;
		setSubmitting(true);
		try {
			let expectedDocumentId: Id<"documents">;
			if (online) {
				// Kick (or re-kick) then await — a failed early render must not
				// strand the flow, so Confirm re-runs it.
				kickPdf();
				expectedDocumentId = await ensurePdf();
			} else if (canSignOffline(quote, latestDoc ?? null)) {
				expectedDocumentId = latestDoc!._id;
			} else {
				Alert.alert(
					"Connect to prepare this quote for signing",
					"This quote needs an online refresh before a signature can be captured offline."
				);
				return;
			}

			// Durable BEFORE telling the user it's saved (PRD §4.6) — nothing here
			// survives only in memory.
			const svg = buildSignatureSvg(strokes, padSize.w, padSize.h);
			const file = await writeDurableText(svg, "image/svg+xml", "svg");

			const saved = await saveOffline(
				"quotes.approveInPerson",
				{
					id: quote._id,
					clientContactId: selectedId,
					expectedDocumentId,
					signatureRawData: JSON.stringify({ ...padSize, strokes }),
					deviceDescription: `${Device.modelName ?? Platform.OS} · OneTool mobile`,
					capturedAt: Date.now(),
				},
				{
					display: {
						title: `Signature for ${quote.quoteNumber ?? "quote"}`,
						detail: signerName,
					},
					files: [{ argName: "signatureStorageId", file }],
				}
			);
			// The quote screen underneath shows "saved on device" (or, once synced,
			// re-renders to Approved) reactively — landing back on it IS the
			// success state. QUOTE_NOT_PENDING/QUOTE_VERSION_STALE replay conflicts
			// surface later, on the sync issues screen, not here.
			if (saved) router.back();
		} catch {
			Alert.alert(
				"Couldn't record the signature",
				"Nothing was saved. Check your connection and try again."
			);
		} finally {
			setSubmitting(false);
		}
	};

	const header = (
		<View style={[styles.header, { backgroundColor: t.card, borderBottomColor: t.line, paddingTop: insets.top }]}>
			<Pressable
				onPress={() => router.back()}
				accessibilityRole="button"
				accessibilityLabel="Close without signing"
				hitSlop={8}
				style={styles.headerSide}
			>
				<Text style={[styles.cancel, { color: t.frostedInk }]}>Cancel</Text>
			</Pressable>
			<View style={styles.headerTitleWrap}>
				<Text style={[styles.headerTitle, { color: t.ink }]} numberOfLines={1}>
					Get signature
				</Text>
				{quote?.quoteNumber ? (
					<Text style={[styles.headerSub, { color: t.sub }]} numberOfLines={1}>
						{quote.quoteNumber}
					</Text>
				) : null}
			</View>
			<View style={styles.headerSide} />
		</View>
	);

	if (!quote || sortedContacts === undefined) {
		return (
			<SafeAreaView style={[styles.flex, { backgroundColor: t.bg }]} edges={[]}>
				{header}
				<View style={styles.loading}>
					<ActivityIndicator color={t.sub} />
				</View>
			</SafeAreaView>
		);
	}

	if (step === "signer") {
		return (
			<SafeAreaView style={[styles.flex, { backgroundColor: t.bg }]} edges={[]}>
				{header}
				<ScrollView
					contentContainerStyle={[
						styles.scroll,
						{ paddingBottom: 24 + insets.bottom },
					]}
				>
					<Panel
						header={<PanelHeader title={"Who's signing?"} />}
					>
						{sortedContacts.length === 0 ? (
							<EmptyPanel
								title="No contacts on this client"
								body="Add a contact to the client first — the signature is recorded under their name."
							/>
						) : (
							sortedContacts.map((c) => (
								<RecordRow
									key={c._id}
									leading={<User size={18} color={t.sub} strokeWidth={2} />}
									title={`${c.firstName} ${c.lastName}`.trim()}
									subtitle={
										[
											c.isPrimary ? "Primary contact" : null,
											c.email ?? c.phone ?? null,
										]
											.filter(Boolean)
											.join(" · ") || undefined
									}
									selected={c._id === selectedId}
									chevron={false}
									right={
										c._id === selectedId ? (
											<Check size={17} color={t.primarySolid} strokeWidth={2.5} />
										) : undefined
									}
									onPress={() => setContactId(c._id)}
								/>
							))
						)}
					</Panel>
				</ScrollView>
				<View
					style={[
						styles.footer,
						{ backgroundColor: t.card, borderTopColor: t.line, paddingBottom: Math.max(insets.bottom, 12) },
					]}
				>
					<Button
						title="Continue to signature"
						disabled={!selectedId}
						onPress={() => {
							// Background render: failures surface on Confirm, which
							// re-runs ensurePdf. Swallow here so the kick can't raise an
							// unhandled rejection.
							kickPdf();
							setStep("canvas");
						}}
					/>
				</View>
			</SafeAreaView>
		);
	}

	// --- Canvas step --- geometry unchanged from the pre-restyle version: phone
	// rotates the measured frame 90° so the pad is a wide landscape canvas while
	// the app stays portrait; iPad is already wide, so it signs unrotated.
	const termsLine = quote.terms
		? `By signing, ${signerName} approves this quote and accepts its terms.`
		: `By signing, ${signerName} approves this quote.`;

	const surface = (
		<View style={styles.surface}>
			<View style={styles.surfaceHead}>
				<Text style={[styles.signerLabel, { color: t.ink }]}>{signerName}</Text>
				<Text style={[styles.termsLine, { color: t.sub }]}>{termsLine}</Text>
			</View>
			<View
				style={styles.padWrap}
				onLayout={(e: LayoutChangeEvent) =>
					setPadSize({
						w: e.nativeEvent.layout.width,
						h: e.nativeEvent.layout.height,
					})
				}
			>
				{padSize ? (
					<SignaturePad
						width={padSize.w}
						height={padSize.h}
						strokes={strokes}
						onStrokesChange={setStrokes}
					/>
				) : null}
			</View>
			<View style={styles.rail}>
				<Pressable
					onPress={() => setStrokes([])}
					disabled={strokes.length === 0 || submitting}
					hitSlop={12}
					style={styles.clearWrap}
				>
					<Text
						style={[
							styles.clear,
							{ color: t.frostedInk },
							(strokes.length === 0 || submitting) && styles.clearDisabled,
						]}
					>
						Clear
					</Text>
				</Pressable>
				<Button
					title={submitting ? "Recording…" : "Accept and sign"}
					disabled={strokes.length === 0 || submitting}
					onPress={() => void confirm()}
					style={styles.railButtonWide}
				/>
			</View>
		</View>
	);

	return (
		<SafeAreaView style={[styles.flex, { backgroundColor: t.bg }]} edges={[]}>
			{header}
			{device === "ipad" ? (
				<View style={[styles.ipadFrame, { paddingBottom: insets.bottom + 24 }]}>
					{surface}
				</View>
			) : (
				<RotatedFrame>{surface}</RotatedFrame>
			)}
		</SafeAreaView>
	);
}

/** Measures the available frame and renders children rotated 90° inside it. */
function RotatedFrame({ children }: { children: ReactNode }) {
	const [frame, setFrame] = useState<{ w: number; h: number } | null>(null);
	return (
		<View
			style={styles.rotateHost}
			onLayout={(e) =>
				setFrame({
					w: e.nativeEvent.layout.width,
					h: e.nativeEvent.layout.height,
				})
			}
		>
			{frame ? (
				<View
					style={{
						width: frame.h - 32,
						height: frame.w - 16,
						transform: [{ rotate: "90deg" }],
					}}
				>
					{children}
				</View>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	loading: { flex: 1, alignItems: "center", justifyContent: "center" },
	scroll: { paddingHorizontal: 16, paddingTop: 16, gap: 16 },
	header: {
		flexDirection: "row",
		alignItems: "center",
		minHeight: 52,
		paddingHorizontal: 12,
		paddingBottom: 10,
		borderBottomWidth: 1,
	},
	headerSide: { width: 64, justifyContent: "center" },
	cancel: {
		fontFamily: fontFamily.medium,
		fontSize: type.body,
	},
	headerTitleWrap: { flex: 1, alignItems: "center" },
	headerTitle: {
		fontFamily: fontFamily.semibold,
		fontSize: type.h3,
	},
	headerSub: {
		fontFamily: fontFamily.medium,
		fontSize: type.meta,
		fontVariant: ["tabular-nums"],
	},
	termsLine: {
		fontFamily: fontFamily.medium,
		fontSize: type.meta,
	},
	clearWrap: { justifyContent: "center", paddingHorizontal: 4 },
	clear: {
		fontFamily: fontFamily.medium,
		fontSize: type.sm,
	},
	clearDisabled: { opacity: 0.5 },
	footer: {
		paddingHorizontal: 16,
		paddingTop: 12,
		borderTopWidth: 1,
	},
	rotateHost: { flex: 1, alignItems: "center", justifyContent: "center" },
	ipadFrame: { flex: 1, paddingTop: 24, paddingHorizontal: 48 },
	surface: { flex: 1, gap: 12 },
	surfaceHead: { gap: 2, paddingHorizontal: 4 },
	signerLabel: {
		fontFamily: fontFamily.semibold,
		fontSize: type.rowTitle,
		letterSpacing: tracking.title,
	},
	padWrap: { flex: 1 },
	rail: { flexDirection: "row", alignItems: "center", gap: 10 },
	railButtonWide: { flex: 1 },
});
