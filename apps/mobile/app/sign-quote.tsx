import { useCallback, useMemo, useRef, useState } from "react";
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
import { useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import * as Device from "expo-device";
import { X } from "lucide-react-native";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { fontFamily, tracking, type, useTokens } from "@/lib/theme";
import { useDevice } from "@/lib/use-device";
import { AppHeader } from "@/components/app-header";
import { Button, Card, DotGrid, Eyebrow, ListRow } from "@/components/ui";
import {
	SignaturePad,
	buildSignatureSvg,
	type SignatureStroke,
} from "@/components/signature/signature-pad";
import { formatCurrency } from "@/lib/format";

// In-person signature flow (Slice 3, frame-1h follow-through): pick the
// signer, then capture the signature. Phone keeps the app portrait and
// rotates the signing surface 90° (Jobber's pattern — a wide canvas without
// orientation-lock complexity); iPad is already wide, so it signs unrotated.
// No Skip: if the client can't sign now, the resend path covers it.

export default function SignQuoteScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const t = useTokens();
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const { device } = useDevice();

	const quote = useQuery(
		api.quotes.get,
		id ? { id: id as Id<"quotes"> } : "skip"
	);
	const contacts = useQuery(
		api.clientContacts.listByClient,
		quote ? { clientId: quote.clientId } : "skip"
	);

	const ensureQuotePdf = useAction(api.pdfActions.ensureQuotePdf);
	// Quotes-gated upload target — works for members without documents-modify.
	const generateUploadUrl = useMutation(api.quotes.generateSignatureUploadUrl);
	const approveInPerson = useMutation(api.quotes.approveInPerson);

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
	// is being picked so Confirm doesn't wait on it. Confirm re-awaits (and
	// retries once) — a failed early render must not strand the flow.
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
			void ensurePdf(); // kick (or re-kick) before the upload round-trips
			const svg = buildSignatureSvg(strokes, padSize.w, padSize.h);
			const uploadUrl = await generateUploadUrl();
			const res = await fetch(uploadUrl, {
				method: "POST",
				headers: { "Content-Type": "image/svg+xml" },
				body: svg,
			});
			if (!res.ok) throw new Error("Signature upload failed");
			const { storageId } = (await res.json()) as {
				storageId: Id<"_storage">;
			};
			const expectedDocumentId = await ensurePdf();
			await approveInPerson({
				id: quote._id,
				clientContactId: selectedId,
				expectedDocumentId,
				signatureStorageId: storageId,
				signatureRawData: JSON.stringify({ ...padSize, strokes }),
				deviceDescription: `${Device.modelName ?? Platform.OS} · OneTool mobile`,
			});
			// The quote screen underneath re-renders to Approved reactively —
			// landing back on it IS the success state.
			router.back();
		} catch (err) {
			// The field race is real: the client can approve via the portal while
			// the phone is on the canvas. Name that state instead of blaming the
			// network — retrying can't fix an already-decided quote.
			const code =
				err instanceof ConvexError &&
				typeof err.data === "object" &&
				err.data !== null
					? (err.data as { code?: string }).code
					: undefined;
			if (code === "QUOTE_NOT_PENDING") {
				Alert.alert(
					"This quote is no longer awaiting approval",
					"It was already approved or declined — check its status.",
					[{ text: "OK", onPress: () => router.back() }]
				);
			} else if (code === "QUOTE_VERSION_STALE") {
				pdfPromise.current = null; // re-resolve the pinned version on retry
				Alert.alert(
					"The quote changed",
					"Its document was updated — try confirming again."
				);
			} else {
				Alert.alert(
					"Couldn't record the signature",
					"Nothing was saved. Check your connection and try again."
				);
			}
		} finally {
			setSubmitting(false);
		}
	};

	if (!quote || sortedContacts === undefined) {
		return (
			<SafeAreaView style={[styles.flex, { backgroundColor: t.bg }]} edges={[]}>
				<DotGrid style={StyleSheet.absoluteFill} />
				<AppHeader mode="detail" title="Get signature" />
				<View style={styles.loading}>
					<ActivityIndicator color={t.sub} />
				</View>
			</SafeAreaView>
		);
	}

	if (step === "signer") {
		const clientLine = [
			quote.quoteNumber,
			formatCurrency(quote.total, { exact: true }),
		]
			.filter(Boolean)
			.join(" · ");
		return (
			<SafeAreaView style={[styles.flex, { backgroundColor: t.bg }]} edges={[]}>
				<DotGrid style={StyleSheet.absoluteFill} />
				<AppHeader mode="detail" title="Get signature" />
				<ScrollView
					contentContainerStyle={[
						styles.scroll,
						{ paddingBottom: 24 + insets.bottom },
					]}
				>
					<Text style={[styles.contextLine, { color: t.sub }]}>
						{clientLine}
					</Text>
					<View style={styles.section}>
						<Eyebrow>{"Who’s signing?"}</Eyebrow>
						{sortedContacts.length === 0 ? (
							<Card style={styles.emptyCard}>
								<Text style={[styles.emptyTitle, { color: t.ink }]}>
									No contacts on this client
								</Text>
								<Text style={[styles.emptyBody, { color: t.sub }]}>
									Add a contact to the client first — the signature is
									recorded under their name.
								</Text>
							</Card>
						) : (
							<Card style={styles.listCard}>
								{sortedContacts.map((c) => (
									<ListRow
										key={c._id}
										icon="User"
										title={`${c.firstName} ${c.lastName}`.trim()}
										sub={
											[
												c.isPrimary ? "Primary contact" : null,
												c.email ?? c.phone ?? null,
											]
												.filter(Boolean)
												.join(" · ") || undefined
										}
										selected={c._id === selectedId}
										onPress={() => setContactId(c._id)}
									/>
								))}
							</Card>
						)}
					</View>
				</ScrollView>
				<View
					style={[styles.footer, { paddingBottom: 12 + insets.bottom }]}
				>
					<Button
						title="Continue to signature"
						disabled={!selectedId}
						onPress={() => {
							void ensurePdf();
							setStep("canvas");
						}}
					/>
				</View>
			</SafeAreaView>
		);
	}

	// --- Canvas step ---
	const termsLine = quote.terms
		? `By signing, ${signerName} approves this quote and accepts its terms.`
		: `By signing, ${signerName} approves this quote.`;

	const surface = (
		<View style={styles.surface}>
			<View style={styles.surfaceHead}>
				<Text style={[styles.signerLabel, { color: t.ink }]}>
					{signerName}
				</Text>
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
				<Button
					title="Clear"
					variant="secondary"
					disabled={strokes.length === 0 || submitting}
					onPress={() => setStrokes([])}
					style={styles.railButton}
				/>
				<Button
					title={submitting ? "Recording…" : "Confirm approval"}
					disabled={strokes.length === 0 || submitting}
					onPress={() => void confirm()}
					style={styles.railButtonWide}
				/>
			</View>
		</View>
	);

	return (
		<SafeAreaView style={[styles.flex, { backgroundColor: t.bg }]} edges={[]}>
			<DotGrid style={StyleSheet.absoluteFill} />
			{device === "ipad" ? (
				<View
					style={[
						styles.ipadFrame,
						{ paddingTop: insets.top + 56, paddingBottom: insets.bottom + 24 },
					]}
				>
					{surface}
				</View>
			) : (
				// Phone: portrait app, rotated signing surface. The centered child
				// swaps the measured frame's dimensions, then rotates about its
				// center — gesture coordinates arrive in the child's own (rotated)
				// space, so the pad needs no coordinate math.
				<RotatedFrame>{surface}</RotatedFrame>
			)}
			<Pressable
				accessibilityRole="button"
				accessibilityLabel="Close without signing"
				onPress={() => router.back()}
				hitSlop={12}
				style={({ pressed }) => [
					styles.close,
					{
						top: insets.top + 10,
						backgroundColor: pressed ? t.secondary : t.card,
						borderColor: t.line,
					},
				]}
			>
				<X size={18} color={t.sub} strokeWidth={2.25} />
			</Pressable>
		</SafeAreaView>
	);
}

/** Measures the available frame and renders children rotated 90° inside it. */
function RotatedFrame({ children }: { children: React.ReactNode }) {
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
	scroll: { paddingHorizontal: 16, paddingTop: 4 },
	contextLine: {
		fontFamily: fontFamily.medium,
		fontSize: type.meta,
		marginBottom: 16,
		fontVariant: ["tabular-nums"],
	},
	section: { gap: 10 },
	listCard: { paddingVertical: 2, paddingHorizontal: 4 },
	emptyCard: { padding: 16, gap: 4 },
	emptyTitle: { fontFamily: fontFamily.semibold, fontSize: type.rowTitle },
	emptyBody: { fontFamily: fontFamily.medium, fontSize: type.meta },
	footer: { paddingHorizontal: 16, paddingTop: 8 },
	rotateHost: { flex: 1, alignItems: "center", justifyContent: "center" },
	ipadFrame: { flex: 1, paddingHorizontal: 48 },
	surface: { flex: 1, gap: 12 },
	surfaceHead: { gap: 2, paddingHorizontal: 4 },
	signerLabel: {
		fontFamily: fontFamily.semibold,
		fontSize: type.rowTitle,
		letterSpacing: tracking.title,
	},
	termsLine: { fontFamily: fontFamily.medium, fontSize: type.meta },
	padWrap: { flex: 1 },
	rail: { flexDirection: "row", gap: 10 },
	railButton: { flex: 1 },
	railButtonWide: { flex: 2 },
	close: {
		position: "absolute",
		left: 16,
		width: 34,
		height: 34,
		borderRadius: 17,
		borderWidth: StyleSheet.hairlineWidth,
		alignItems: "center",
		justifyContent: "center",
	},
});
