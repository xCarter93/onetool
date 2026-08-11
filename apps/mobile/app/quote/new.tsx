import { useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { X } from "lucide-react-native";
import { fontFamily, radii, type, useTokens } from "@/lib/theme";
import { Button, Eyebrow } from "@/components/ui";
import { CenteredModal } from "@/components/ipad/centered-modal";
import { ClientPicker } from "@/components/create/client-picker";
import { FieldMenu } from "@/components/FieldMenu";
import { useDevice } from "@/lib/use-device";
import { usePermissions } from "@/lib/use-permissions";
import { hapticSuccess } from "@/lib/haptics";
import { describeMutationError } from "@/lib/mutation-error";

// FieldMenu action id for "no project" — an empty-string id is not a shape the
// native MenuView is known to round-trip.
const NO_PROJECT = "__none__";

// Fast-capture quote create (Slice 5 speed-dial). This screen only mints the
// empty draft — the line-item sheet on the quote detail screen (Slice 4) is
// where the money gets entered, so the sheet hands off immediately.
export default function NewQuoteSheet() {
	const t = useTokens();
	const insets = useSafeAreaInsets();
	const { device } = useDevice();
	const { can, isLoading: permsLoading } = usePermissions();
	const params = useLocalSearchParams<{ clientId?: string }>();

	const [clientId, setClientId] = useState<Id<"clients"> | "">(
		(params.clientId as Id<"clients">) || ""
	);
	// A client pushed in on the route is settled — show it read-only.
	const clientLocked = !!params.clientId;
	const [projectId, setProjectId] = useState<Id<"projects"> | "">("");
	const [title, setTitle] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<{
		message: string;
		planLimit: boolean;
	} | null>(null);

	const createQuote = useMutation(api.quotes.create);
	const projects = useQuery(
		api.projects.list,
		clientId ? { clientId: clientId as Id<"clients"> } : "skip"
	);
	const projectOptions = [
		{ value: NO_PROJECT, label: "No project" },
		...(projects ?? []).map((p) => ({ value: p._id, label: p.title })),
	];
	const projectLabel =
		projectOptions.find((o) => o.value === projectId)?.label ?? "No project";

	const canCreate = can("quotes", "modify");
	const valid = !!clientId;

	const submit = async () => {
		if (!valid || submitting) return;
		setSubmitting(true);
		setError(null);
		try {
			const quoteId = (await createQuote({
				clientId: clientId as Id<"clients">,
				projectId: projectId ? (projectId as Id<"projects">) : undefined,
				title: title.trim() || undefined,
				status: "draft",
				subtotal: 0,
				total: 0,
			})) as Id<"quotes">;
			hapticSuccess();
			router.replace(`/quote/${quoteId}`);
		} catch (err) {
			setError(
				describeMutationError(
					err,
					"Couldn't start that quote. Check your connection and try again."
				)
			);
		} finally {
			setSubmitting(false);
		}
	};

	// `can` is false while permissions resolve — wait before hiding.
	if (!permsLoading && !canCreate) return null;

	const content = (
		<>
			<View style={styles.header}>
				<View style={{ flex: 1 }} />
				<Text style={[styles.headerTitle, { color: t.ink }]}>New quote</Text>
				<View style={styles.headerAction}>
					<Pressable
						onPress={() => router.back()}
						hitSlop={8}
						accessibilityRole="button"
						accessibilityLabel="Close"
						style={styles.closeBtn}
					>
						<X size={22} color={t.sub} />
					</Pressable>
				</View>
			</View>

			<ScrollView
				style={styles.flex}
				contentContainerStyle={styles.body}
				keyboardShouldPersistTaps="handled"
			>
				<Eyebrow>Client</Eyebrow>
				<ClientPicker
					value={clientId}
					onChange={(next) => {
						setClientId(next);
						setProjectId(""); // a new client invalidates the staged project
					}}
					allowQuickAdd={!clientLocked && can("clients", "modify")}
					locked={clientLocked}
				/>

				{/* Optional, and only when the client actually has projects — same
				    FieldMenu idiom as the task form's client/project pair. */}
				{clientId && projects && projects.length > 0 ? (
					<View style={styles.field}>
						<Eyebrow>Project</Eyebrow>
						<View style={styles.menuWrap}>
							<FieldMenu
								title="Select project"
								value={projectId || NO_PROJECT}
								options={projectOptions}
								label={projectLabel}
								placeholder={!projectId}
								onSelect={(next) =>
									setProjectId(
										next === NO_PROJECT ? "" : (next as Id<"projects">)
									)
								}
							/>
						</View>
					</View>
				) : null}

				<View style={styles.field}>
					<Eyebrow>Title</Eyebrow>
					<TextInput
						value={title}
						onChangeText={setTitle}
						placeholder="Optional"
						placeholderTextColor={t.faint}
						style={[
							styles.input,
							{ borderColor: t.line, backgroundColor: t.card, color: t.ink },
						]}
						accessibilityLabel="Quote title"
					/>
				</View>

				{error ? (
					<Text style={[styles.error, { color: t.destructive }]}>
						{error.planLimit
							? `${error.message} Upgrade on the web app to add more.`
							: error.message}
					</Text>
				) : null}

				<Button
					title="Create quote"
					onPress={() => void submit()}
					disabled={!valid || submitting}
					icon={
						submitting ? (
							<ActivityIndicator size="small" color={t.primaryInk} />
						) : undefined
					}
					style={styles.submit}
				/>
				<Text style={[styles.footnote, { color: t.sub }]}>
					You&rsquo;ll add line items on the next screen.
				</Text>
			</ScrollView>
		</>
	);

	if (device === "ipad") {
		return (
			<CenteredModal onScrimPress={() => router.back()} maxHeight="92%">
				<View style={[styles.padCard, { backgroundColor: t.card }]}>
					{content}
				</View>
			</CenteredModal>
		);
	}

	return (
		<View
			style={[
				styles.container,
				{ backgroundColor: t.card, paddingBottom: insets.bottom },
			]}
		>
			<View style={[styles.grabber, { backgroundColor: t.line }]} />
			{content}
		</View>
	);
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	container: {
		flex: 1,
		borderTopLeftRadius: 30,
		borderTopRightRadius: 30,
		overflow: "hidden",
	},
	padCard: { flex: 1, paddingTop: 18 },
	grabber: {
		alignSelf: "center",
		width: 44,
		height: 5,
		borderRadius: 999,
		marginTop: 10,
		marginBottom: 12,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 20,
		paddingBottom: 12,
	},
	headerTitle: {
		flex: 2,
		textAlign: "center",
		fontSize: type.h2,
		lineHeight: 30,
		fontFamily: fontFamily.bold,
	},
	headerAction: { flex: 1, alignItems: "flex-end" },
	closeBtn: {
		width: 32,
		height: 32,
		borderRadius: 999,
		alignItems: "center",
		justifyContent: "center",
	},
	body: { paddingHorizontal: 20, paddingBottom: 32 },
	field: { marginTop: 20 },
	// FieldMenu has no outer margin of its own; match the TextInput's offset.
	menuWrap: { marginTop: 8 },
	input: {
		borderWidth: 1,
		borderRadius: radii.ctrl,
		paddingHorizontal: 14,
		paddingVertical: 12,
		fontSize: type.h4,
		fontFamily: fontFamily.regular,
		marginTop: 8,
	},
	error: {
		fontFamily: fontFamily.medium,
		fontSize: type.meta,
		marginTop: 16,
	},
	submit: { marginTop: 24 },
	footnote: {
		fontFamily: fontFamily.regular,
		fontSize: type.xs,
		textAlign: "center",
		marginTop: 10,
	},
});
