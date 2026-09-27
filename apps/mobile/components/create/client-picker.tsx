import { useMemo, useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { Check, ChevronsUpDown, Plus, Search, X } from "lucide-react-native";
import { fontFamily, radii, type, useTokens } from "@/lib/theme";
import { Button } from "@/components/ui";
import { RecordRow, TypeTile } from "@/components/canvas";
import { hapticSelect } from "@/lib/haptics";
import { describeMutationError } from "@/lib/mutation-error";

// Above this many clients the list stops being scannable — a filter appears.
const FILTER_THRESHOLD = 8;

// A RecordRow measures 11+11 padding + 56 min height + 1 hairline separator.
// Five of them is the tallest the list can get before it pushes the rest of the
// create sheet off-screen (visual pass: 15+ clients rendered full-height).
const ROW_HEIGHT = 58;
const MAX_VISIBLE_ROWS = 5;
const LIST_MAX_HEIGHT = ROW_HEIGHT * MAX_VISIBLE_ROWS;

/** Mirrors backend ValidationPatterns.isValidPhone so we never orphan a client. */
function isValidPhone(phone: string): boolean {
	return /^\+?[\d\s()-]+$/.test(phone) && phone.replace(/\D/g, "").length >= 10;
}

/**
 * Bare-row client picker shared by the fast-capture create sheets (Slice 5).
 * Closed state reads as a web select trigger (white, `input` border, 4px, 44
 * tall) with the chosen client's type tile. Open state lists candidates as
 * hairline record rows.
 *
 * `allowQuickAdd` adds a "+ New client" row that expands INLINE into name +
 * phone. Confirming creates the client and its primary contact, then selects
 * it — the capture flow never navigates away.
 *
 * `locked` is the "pushed from client detail with ?clientId=" case: the client
 * is already known, so the picker collapses to a read-only trigger and the
 * form opens straight on its own fields.
 */
export function ClientPicker({
	value,
	onChange,
	allowQuickAdd = false,
	locked = false,
}: {
	value: Id<"clients"> | "";
	onChange: (id: Id<"clients">) => void;
	allowQuickAdd?: boolean;
	locked?: boolean;
}) {
	const t = useTokens();
	const clients = useQuery(api.clients.list, {});
	const createClient = useMutation(api.clients.create);
	const createContact = useMutation(api.clientContacts.create);

	const [filter, setFilter] = useState("");
	// Collapse-on-select: once a client is chosen the list folds into a single
	// trigger row. "Change" flips this back open. Derived at render — never an effect.
	const [reopened, setReopened] = useState(false);
	const [quickOpen, setQuickOpen] = useState(false);
	const [quickName, setQuickName] = useState("");
	const [quickPhone, setQuickPhone] = useState("");
	const [quickSaving, setQuickSaving] = useState(false);
	const [quickError, setQuickError] = useState<string | null>(null);
	const [quickHint, setQuickHint] = useState<string | null>(null);

	const rows = useMemo(() => {
		const all = clients ?? [];
		const q = filter.trim().toLowerCase();
		if (!q) return all;
		return all.filter((c) => c.companyName.toLowerCase().includes(q));
	}, [clients, filter]);

	const quickValid =
		quickName.trim().length > 0 && isValidPhone(quickPhone.trim());

	const select = (id: Id<"clients">) => {
		hapticSelect();
		onChange(id);
		setReopened(false);
		setFilter("");
	};

	const confirmQuickAdd = async () => {
		if (!quickValid || quickSaving) return;
		setQuickSaving(true);
		setQuickError(null);
		setQuickHint(null);
		const name = quickName.trim();
		try {
			const clientId = (await createClient({
				companyName: name,
				status: "active",
			})) as Id<"clients">;
			// The contact carries the phone so the detail screen's call/message
			// actions work. A failure here must not strand a real client: keep it,
			// select it, and say what's missing.
			try {
				await createContact({
					clientId,
					firstName: name,
					lastName: "",
					phone: quickPhone.trim(),
					isPrimary: true,
				});
			} catch {
				setQuickHint("Client saved, but the phone number didn't stick.");
			}
			select(clientId);
			setQuickOpen(false);
			setQuickName("");
			setQuickPhone("");
		} catch (err) {
			// Plan-limit copy renders as-is — no directional upsell text on
			// mobile (Apple anti-steering).
			setQuickError(
				describeMutationError(
					err,
					"Couldn't add that client. Check your connection and try again."
				).message
			);
		} finally {
			setQuickSaving(false);
		}
	};

	if (clients === undefined) {
		return (
			<View style={styles.loading}>
				<ActivityIndicator size="small" color={t.sub} />
			</View>
		);
	}

	const selected = value ? clients.find((c) => c._id === value) : undefined;

	// Preselected client (?clientId=): read-only trigger, no search / list / quick-add.
	// The name is resolved off the list we already have — no extra query.
	if (locked) {
		return (
			<View style={[styles.trigger, { borderColor: t.input, backgroundColor: t.card }]}>
				<TypeTile kind="client" size={24} />
				<Text style={[styles.triggerText, { color: t.ink }]} numberOfLines={1}>
					{selected?.companyName ?? "Selected client"}
				</Text>
			</View>
		);
	}

	// Chosen: fold to a select trigger so the fields below get the vertical space back.
	if (selected && !reopened) {
		return (
			<Pressable
				onPress={() => setReopened(true)}
				accessibilityRole="button"
				accessibilityLabel={`Client: ${selected.companyName}. Change`}
				style={({ pressed }) => [
					styles.trigger,
					{ borderColor: t.input, backgroundColor: pressed ? t.secondary : t.card },
				]}
			>
				<TypeTile kind="client" size={24} />
				<Text style={[styles.triggerText, { color: t.ink }]} numberOfLines={1}>
					{selected.companyName}
				</Text>
				<ChevronsUpDown size={16} color={t.sub} />
			</Pressable>
		);
	}

	const showFilter = clients.length > FILTER_THRESHOLD;

	return (
		<View>
			{showFilter ? (
				<View
					style={[
						styles.searchBar,
						{ backgroundColor: t.card, borderColor: t.input },
					]}
				>
					<Search size={18} color={t.sub} />
					<TextInput
						value={filter}
						onChangeText={setFilter}
						placeholder="Search clients…"
						placeholderTextColor={t.sub}
						autoCorrect={false}
						style={[styles.searchInput, { color: t.ink }]}
						accessibilityLabel="Search clients"
					/>
					{filter.length > 0 ? (
						<Pressable
							onPress={() => setFilter("")}
							hitSlop={8}
							accessibilityRole="button"
							accessibilityLabel="Clear search"
						>
							<X size={16} color={t.sub} />
						</Pressable>
					) : null}
				</View>
			) : null}

			<View style={[styles.list, { borderColor: t.line, backgroundColor: t.card }]}>
				{/* Pinned above the scroll area: a trailing quick-add row would be
				    scrolled out of reach the moment the list overflows. */}
				{allowQuickAdd && !quickOpen ? (
					<RecordRow
						leading={
							<View style={[styles.addTile, { backgroundColor: t.frostedBg }]}>
								<Plus size={16} color={t.primary} strokeWidth={2} />
							</View>
						}
						title="New client"
						chevron={false}
						onPress={() => {
							setQuickError(null);
							setQuickHint(null);
							setQuickOpen(true);
						}}
					/>
				) : null}

				{/* The inline quick-add form takes over this space while it's open. */}
				{quickOpen ? null : rows.length === 0 ? (
					<Text style={[styles.empty, { color: t.sub }]}>
						{clients.length === 0
							? "No clients yet."
							: "No clients match that search."}
					</Text>
				) : (
					<ScrollView
						style={{ maxHeight: LIST_MAX_HEIGHT }}
						nestedScrollEnabled
						keyboardShouldPersistTaps="handled"
						showsVerticalScrollIndicator={rows.length > MAX_VISIBLE_ROWS}
					>
						{rows.map((c, i) => (
							<View
								key={c._id}
								style={i > 0 || allowQuickAdd ? { borderTopWidth: 1, borderTopColor: t.lineSoft } : undefined}
							>
								<RecordRow
									kind="client"
									title={c.companyName}
									selected={c._id === value}
									chevron={false}
									right={
										c._id === value ? (
											<Check size={17} color={t.primary} strokeWidth={2.5} />
										) : undefined
									}
									onPress={() => select(c._id)}
								/>
							</View>
						))}
					</ScrollView>
				)}
			</View>

			{allowQuickAdd && quickOpen ? (
				<View
					style={[
						styles.quick,
						{ backgroundColor: t.card, borderColor: t.line },
					]}
				>
					<View style={styles.quickHead}>
						<Text style={[styles.quickTitle, { color: t.ink }]}>
							New client
						</Text>
						<Pressable
							onPress={() => {
								setQuickOpen(false);
								setQuickError(null);
							}}
							hitSlop={8}
							disabled={quickSaving}
							accessibilityRole="button"
							accessibilityLabel="Cancel new client"
						>
							<X size={16} color={t.sub} />
						</Pressable>
					</View>
					<TextInput
						value={quickName}
						onChangeText={setQuickName}
						placeholder="Client or company name"
						placeholderTextColor={t.sub}
						autoCapitalize="words"
						style={[
							styles.input,
							{ borderColor: t.input, backgroundColor: t.card, color: t.ink },
						]}
						accessibilityLabel="Client name"
					/>
					<TextInput
						value={quickPhone}
						onChangeText={setQuickPhone}
						placeholder="Phone number"
						placeholderTextColor={t.sub}
						keyboardType="phone-pad"
						style={[
							styles.input,
							{ borderColor: t.input, backgroundColor: t.card, color: t.ink },
						]}
						accessibilityLabel="Client phone number"
					/>
					{quickPhone.trim().length > 0 && !isValidPhone(quickPhone.trim()) ? (
						<Text style={[styles.hint, { color: t.sub }]}>
							Enter a phone number with at least 10 digits.
						</Text>
					) : null}
					{quickError ? (
						<Text style={[styles.error, { color: t.danger }]}>
							{quickError}
						</Text>
					) : null}
					<Button
						title={quickSaving ? "Adding…" : "Add client"}
						size="sm"
						disabled={!quickValid || quickSaving}
						onPress={() => void confirmQuickAdd()}
						style={styles.quickCta}
					/>
				</View>
			) : null}

			{quickHint ? (
				<Text style={[styles.hint, { color: t.sub }]}>{quickHint}</Text>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	loading: { paddingVertical: 24, alignItems: "center" },
	trigger: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		minHeight: 44,
		borderWidth: 1,
		borderRadius: radii.ctrl,
		paddingHorizontal: 10,
	},
	triggerText: {
		flex: 1,
		fontFamily: fontFamily.medium,
		fontSize: 16,
	},
	searchBar: {
		flexDirection: "row",
		alignItems: "center",
		gap: 9,
		borderWidth: 1,
		borderRadius: radii.ctrl,
		paddingHorizontal: 12,
		height: 44,
		marginBottom: 8,
	},
	searchInput: {
		flex: 1,
		fontFamily: fontFamily.regular,
		fontSize: type.body,
		letterSpacing: 0, // RN#42589: pin kern so iOS placeholder can't randomly letter-space
	},
	list: {
		borderWidth: 1,
		borderRadius: radii.card,
		overflow: "hidden",
	},
	addTile: {
		width: 32,
		height: 32,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
	},
	empty: {
		fontFamily: fontFamily.medium,
		fontSize: type.meta,
		paddingVertical: 14,
		paddingHorizontal: 12,
	},
	quick: {
		borderWidth: 1,
		borderRadius: radii.card,
		padding: 12,
		gap: 8,
		marginTop: 8,
	},
	quickHead: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	quickTitle: {
		fontFamily: fontFamily.semibold,
		fontSize: type.rowTitle,
	},
	input: {
		borderWidth: 1,
		borderRadius: radii.ctrl,
		paddingHorizontal: 12,
		paddingVertical: 11,
		fontFamily: fontFamily.regular,
		fontSize: type.body,
		letterSpacing: 0,
	},
	quickCta: { marginTop: 2 },
	hint: {
		fontFamily: fontFamily.regular,
		fontSize: type.xs,
		marginTop: 6,
	},
	error: {
		fontFamily: fontFamily.medium,
		fontSize: type.xs,
		marginTop: 2,
	},
});
