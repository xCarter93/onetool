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
import { Check, Search, X } from "lucide-react-native";
import { fontFamily, radii, type, useTokens } from "@/lib/theme";
import { Button, ListRow } from "@/components/ui";
import { hapticSelect } from "@/lib/haptics";
import { describeMutationError } from "@/lib/mutation-error";

// Above this many clients the list stops being scannable — a filter appears.
const FILTER_THRESHOLD = 8;

// A ListRow measures 12 + 12 padding + 32 icon tile + 1 hairline separator.
// Five of them is the tallest the list can get before it pushes the rest of the
// create sheet off-screen (visual pass: 15+ clients rendered full-height).
const ROW_HEIGHT = 57;
const MAX_VISIBLE_ROWS = 5;
const LIST_MAX_HEIGHT = ROW_HEIGHT * MAX_VISIBLE_ROWS;

/** Mirrors backend ValidationPatterns.isValidPhone so we never orphan a client. */
function isValidPhone(phone: string): boolean {
	return /^\+?[\d\s()-]+$/.test(phone) && phone.replace(/\D/g, "").length >= 10;
}

/**
 * Bare-row client picker shared by the fast-capture create sheets (Slice 5).
 * Selection idiom is sign-quote's signer list: no Card wrapper (it clips the
 * selected row's capsule), a Check on the chosen row, `last` on the final row.
 *
 * `allowQuickAdd` adds a "+ New client" row that expands INLINE into name +
 * phone. Confirming creates the client and its primary contact, then selects
 * it — the capture flow never navigates away.
 *
 * `locked` is the "pushed from client detail with ?clientId=" case: the client
 * is already known, so the picker collapses to a read-only row and the form
 * opens straight on its own fields.
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
	// row. "Change" flips this back open. Derived at render — never an effect.
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
			const { message, planLimit } = describeMutationError(
				err,
				"Couldn't add that client. Check your connection and try again."
			);
			setQuickError(
				planLimit ? `${message} Upgrade on the web app to continue.` : message
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

	// Preselected client (?clientId=): read-only, no search / list / quick-add.
	// The name is resolved off the list we already have — no extra query.
	if (locked) {
		return (
			<ListRow
				icon="Building2"
				title={selected?.companyName ?? "Selected client"}
				showChevron={false}
				last
			/>
		);
	}

	// Chosen: fold to one row so the fields below get the vertical space back.
	if (selected && !reopened) {
		return (
			<ListRow
				icon="Building2"
				title={selected.companyName}
				selected
				showChevron={false}
				last
				onPress={() => setReopened(true)}
				right={
					<View style={styles.collapsedRight}>
						<Text style={[styles.change, { color: t.primarySolid }]}>
							Change
						</Text>
						<Check size={17} color={t.primarySolid} strokeWidth={2.5} />
					</View>
				}
			/>
		);
	}

	const showFilter = clients.length > FILTER_THRESHOLD;
	const lastRowIndex = rows.length - 1;

	return (
		<View>
			{showFilter ? (
				<View
					style={[
						styles.searchBar,
						{ backgroundColor: t.card, borderColor: t.line },
					]}
				>
					<Search size={18} color={t.faint} />
					<TextInput
						value={filter}
						onChangeText={setFilter}
						placeholder="Search clients…"
						placeholderTextColor={t.faint}
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
							<X size={16} color={t.faint} />
						</Pressable>
					) : null}
				</View>
			) : null}

			{/* Pinned above the scroll area: a trailing quick-add row would be
			    scrolled out of reach the moment the list overflows. */}
			{allowQuickAdd && !quickOpen ? (
				<ListRow
					icon="Plus"
					iconColor={t.primarySolid}
					title="New client"
					showChevron={false}
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
						<ListRow
							key={c._id}
							icon="Building2"
							title={c.companyName}
							selected={c._id === value}
							showChevron={false}
							right={
								c._id === value ? (
									<Check size={17} color={t.primarySolid} strokeWidth={2.5} />
								) : undefined
							}
							last={i === lastRowIndex}
							onPress={() => select(c._id)}
						/>
					))}
				</ScrollView>
			)}

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
						placeholderTextColor={t.faint}
						autoCapitalize="words"
						style={[
							styles.input,
							{ borderColor: t.line, backgroundColor: t.bg, color: t.ink },
						]}
						accessibilityLabel="Client name"
					/>
					<TextInput
						value={quickPhone}
						onChangeText={setQuickPhone}
						placeholder="Phone number"
						placeholderTextColor={t.faint}
						keyboardType="phone-pad"
						style={[
							styles.input,
							{ borderColor: t.line, backgroundColor: t.bg, color: t.ink },
						]}
						accessibilityLabel="Client phone number"
					/>
					{quickPhone.trim().length > 0 && !isValidPhone(quickPhone.trim()) ? (
						<Text style={[styles.hint, { color: t.faint }]}>
							Enter a phone number with at least 10 digits.
						</Text>
					) : null}
					{quickError ? (
						<Text style={[styles.error, { color: t.destructive }]}>
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
	collapsedRight: { flexDirection: "row", alignItems: "center", gap: 8 },
	change: {
		fontFamily: fontFamily.semibold,
		fontSize: type.meta,
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
	},
	empty: {
		fontFamily: fontFamily.medium,
		fontSize: type.meta,
		paddingVertical: 14,
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
