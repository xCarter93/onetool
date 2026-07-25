import { useState } from "react";
import {
	ActivityIndicator,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import {
	Bookmark,
	CalendarDays,
	ChevronDown,
	ChevronUp,
	MapPin,
	Search,
	X,
} from "lucide-react-native";
import { fontFamily, radii, type, useTokens } from "@/lib/theme";
import { AppHeader } from "@/components/app-header";
import { PaneHeader } from "@/components/ipad/pane-header";
import { Button, DotGrid, SegmentedToggle, Toggle2 } from "@/components/ui";
import type { Segment } from "@/components/ui/segmented-toggle";
import { useDevice } from "@/lib/use-device";
import {
	AddressAutocomplete,
	type AddressValue,
} from "@/components/AddressAutocomplete.native";
import {
	addManualStop,
	addPropertyStop,
	canAddStop,
	filterProperties,
	fromRoute,
	moveStop,
	newDraft,
	removeStop,
	toWireStops,
	usedPropertyIds,
	type GeocodedProperty,
	type RouteDraft,
} from "@/lib/route-builder";
import { todayDateId, utcMsFromDateId } from "@/lib/date";

const EMPTY_ADDRESS: AddressValue = {
	streetAddress: "",
	city: "",
	state: "",
	zipCode: "",
};

const KIND_SEGMENTS: readonly Segment<"daily" | "saved">[] = [
	{ value: "daily", label: "Today", Icon: CalendarDays },
	{ value: "saved", label: "Saved", Icon: Bookmark },
];

type StopPicker = "list" | "address" | null;

// Full-screen manual route builder — create when no `routeId` param, edit when
// one is present. Pushed from the Routes tab (app/(tabs)/routes.tsx
// `openBuilder`). isStackRoute("/route-edit") renders it full-width beside the
// iPad rail, so headerMode self-detects like clients/new.tsx.
export default function RouteEditScreen() {
	const t = useTokens();
	const router = useRouter();
	const { device } = useDevice();
	const isPane = device === "ipad";
	const params = useLocalSearchParams<{ routeId?: string }>();
	const routeIdParam = Array.isArray(params.routeId)
		? params.routeId[0]
		: params.routeId;
	const routeId = routeIdParam as Id<"routes"> | undefined;

	const routes = useQuery(api.routes.list);
	const org = useQuery(api.organizations.get);
	const propertiesData = useQuery(api.clientProperties.listGeocodedWithClients, {});
	const currentUser = useQuery(api.users.current);
	const members = useQuery(api.users.listByOrg);

	const createRoute = useMutation(api.routes.create);
	const updateRoute = useMutation(api.routes.update);
	const computeRoute = useAction(api.routingActions.computeRoute);

	const existingRoute = routeId
		? (routes?.find((r) => r._id === routeId) ?? null)
		: null;

	const orgStart =
		org && org.latitude != null && org.longitude != null
			? {
					kind: "org" as const,
					label:
						[org.addressStreet, org.addressCity].filter(Boolean).join(", ") ||
						org.name ||
						"Business address",
					latitude: org.latitude,
					longitude: org.longitude,
				}
			: null;

	// Draft init: render-time derivation (no setState-in-effect, error-level in
	// this repo) — mirrors AddressAutocomplete.native's syncedQuery pattern.
	// Create mode inits instantly; edit mode waits for `routes` to load once.
	const [draft, setDraft] = useState<RouteDraft | null>(null);
	const [initializedFor, setInitializedFor] = useState<string | null>(null);
	const initKey = routeId ?? "new";
	const canInit = routeId ? routes !== undefined : true;
	if (initializedFor !== initKey && canInit) {
		const initial =
			routeId && existingRoute
				? fromRoute({
						name: existingRoute.name,
						kind: existingRoute.kind,
						start: existingRoute.start,
						roundTrip: existingRoute.roundTrip,
						stops: existingRoute.stops,
					})
				: newDraft();
		setDraft(initial);
		setInitializedFor(initKey);
	}

	const [savedRouteId, setSavedRouteId] = useState<Id<"routes"> | undefined>(
		routeId
	);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [computeNote, setComputeNote] = useState<string | null>(null);
	const [unreachable, setUnreachable] = useState<ReadonlySet<number>>(
		new Set()
	);

	const [startMode, setStartMode] = useState<"current" | "manual">("current");
	const [manualStart, setManualStart] = useState<AddressValue>(EMPTY_ADDRESS);

	const [stopPicker, setStopPicker] = useState<StopPicker>(null);
	const [stopQuery, setStopQuery] = useState("");
	const [manualStopAddress, setManualStopAddress] =
		useState<AddressValue>(EMPTY_ADDRESS);

	const properties: GeocodedProperty[] = (propertiesData?.properties ?? []).map(
		(p) => ({
			_id: p._id,
			clientId: p.clientId,
			clientCompanyName: p.clientCompanyName,
			propertyName: p.propertyName,
			streetAddress: p.streetAddress,
			city: p.city,
			state: p.state,
			zipCode: p.zipCode,
			formattedAddress: p.formattedAddress,
			latitude: p.latitude,
			longitude: p.longitude,
		})
	);
	const propertyById = new Map(properties.map((p) => [p._id, p]));

	if (!draft) {
		return (
			<Screen isPane={isPane} title={routeId ? "Edit route" : "New route"}>
				<View style={styles.loading}>
					<ActivityIndicator color={t.sub} />
				</View>
			</Screen>
		);
	}
	if (routeId && routes !== undefined && !existingRoute) {
		return (
			<Screen isPane={isPane} title="Route not found">
				<View style={styles.loading}>
					<Text style={{ color: t.sub, fontFamily: fontFamily.medium }}>
						This route no longer exists.
					</Text>
				</View>
			</Screen>
		);
	}

	const usedIds = usedPropertyIds(draft);
	const filteredProperties = filterProperties(properties, stopQuery, usedIds);
	const atStopLimit = !canAddStop(draft);
	const isEditing = routeId !== undefined;

	async function persist(): Promise<Id<"routes"> | undefined> {
		if (!draft) return undefined;
		if (!draft.start) {
			setError("Set a start location first");
			return undefined;
		}
		const name = draft.name.trim() || "Untitled route";
		const stops = toWireStops(draft).map((s) => ({
			...s,
			propertyId: s.propertyId as Id<"clientProperties"> | undefined,
			taskId: s.taskId as Id<"tasks"> | undefined,
			projectId: s.projectId as Id<"projects"> | undefined,
		}));
		const payload = { name, start: draft.start, roundTrip: draft.roundTrip, stops };

		try {
			if (!savedRouteId) {
				const isDaily = draft.kind === "daily";
				const assigneeUserId =
					isDaily && (members?.length ?? 0) > 1 && currentUser
						? currentUser._id
						: undefined;
				const newId = await createRoute({
					...payload,
					kind: draft.kind,
					date: isDaily ? utcMsFromDateId(todayDateId()) : undefined,
					assigneeUserId,
				});
				setSavedRouteId(newId);
				return newId;
			}
			await updateRoute({ routeId: savedRouteId, ...payload });
			return savedRouteId;
		} catch (e) {
			setError(e instanceof Error ? e.message : "Couldn't save the route");
			return undefined;
		}
	}

	const onSave = async () => {
		setBusy(true);
		setError(null);
		const id = await persist();
		setBusy(false);
		if (id) router.back();
	};

	const onCompute = async (optimize: boolean) => {
		setBusy(true);
		setError(null);
		setComputeNote(null);
		setUnreachable(new Set());
		const id = await persist();
		if (!id) {
			setBusy(false);
			return;
		}
		try {
			const result = await computeRoute({ routeId: id, optimize });
			setBusy(false);
			if (!result.applied) {
				setComputeNote("Route changed while computing — try again.");
				return;
			}
			router.back();
		} catch (e) {
			setBusy(false);
			if (e instanceof ConvexError) {
				const data = e.data as { code?: string; stopIndices?: number[] };
				if (data?.code === "unreachable_stops" && data.stopIndices) {
					setUnreachable(new Set(data.stopIndices));
					setError(
						"Some stops can't be reached by road from the start location."
					);
					return;
				}
			}
			setError(e instanceof Error ? e.message : "Route computation failed");
		}
	};

	const addProperty = (property: GeocodedProperty) => {
		setDraft(addPropertyStop(draft, property));
		setStopPicker(null);
		setStopQuery("");
	};

	const addManual = () => {
		if (manualStopAddress.latitude == null || manualStopAddress.longitude == null) {
			setError("Couldn't pin that address");
			return;
		}
		setDraft(
			addManualStop(draft, {
				streetAddress: manualStopAddress.streetAddress,
				city: manualStopAddress.city,
				state: manualStopAddress.state,
				formattedAddress: manualStopAddress.formattedAddress,
				latitude: manualStopAddress.latitude,
				longitude: manualStopAddress.longitude,
			})
		);
		setStopPicker(null);
		setManualStopAddress(EMPTY_ADDRESS);
		setError(null);
	};

	const useBusinessAddress = () => {
		if (!orgStart) return;
		setDraft({ ...draft, start: orgStart });
		setStartMode("current");
	};

	const useManualStart = () => {
		if (manualStart.latitude == null || manualStart.longitude == null) {
			setError("Couldn't pin that address");
			return;
		}
		setDraft({
			...draft,
			start: {
				kind: "manual",
				label:
					manualStart.formattedAddress ??
					[manualStart.streetAddress, manualStart.city]
						.filter(Boolean)
						.join(", "),
				latitude: manualStart.latitude,
				longitude: manualStart.longitude,
			},
		});
		setStartMode("current");
		setManualStart(EMPTY_ADDRESS);
		setError(null);
	};

	const showComputeActions = savedRouteId !== undefined && draft.stops.length > 0;

	return (
		<Screen isPane={isPane} title={routeId ? "Edit route" : "New route"}>
			<KeyboardAvoidingView
				style={styles.flex}
				behavior={Platform.OS === "ios" ? "padding" : undefined}
			>
				<ScrollView
					style={styles.flex}
					contentContainerStyle={styles.content}
					keyboardShouldPersistTaps="handled"
					showsVerticalScrollIndicator={false}
				>
					{/* Name + kind */}
					<Section title="Route" tokens={t}>
						<FieldLabel text="Name" tokens={t} />
						<TextInput
							value={draft.name}
							onChangeText={(v) => setDraft({ ...draft, name: v })}
							placeholder="Untitled route"
							placeholderTextColor={t.faint}
							style={[
								styles.input,
								{ borderColor: t.border, backgroundColor: t.card, color: t.ink },
							]}
						/>
						{!isEditing ? (
							<>
								<FieldLabel text="Type" tokens={t} />
								<SegmentedToggle
									segments={KIND_SEGMENTS}
									value={draft.kind}
									onChange={(kind) => setDraft({ ...draft, kind })}
								/>
							</>
						) : null}
					</Section>

					{/* Start */}
					<Section title="Start" tokens={t}>
						{startMode === "current" ? (
							<View style={styles.startRow}>
								<View style={[styles.startPin, { backgroundColor: t.muted }]}>
									<MapPin size={16} color={t.sub} />
								</View>
								<Text
									style={[styles.startLabel, { color: draft.start ? t.ink : t.faint }]}
									numberOfLines={2}
								>
									{draft.start?.label ?? "No start location set"}
								</Text>
								<Pressable
									onPress={() => setStartMode("manual")}
									hitSlop={8}
									accessibilityRole="button"
									accessibilityLabel="Change start location"
								>
									<Text style={[styles.changeLink, { color: t.frostedInk }]}>
										Change
									</Text>
								</Pressable>
							</View>
						) : (
							<View style={styles.group}>
								{orgStart ? (
									<Pressable
										onPress={useBusinessAddress}
										style={[styles.optionRow, { borderColor: t.border, backgroundColor: t.card }]}
										accessibilityRole="button"
									>
										<Text style={[styles.optionTitle, { color: t.ink }]}>
											Use business address
										</Text>
										<Text style={[styles.optionSub, { color: t.sub }]} numberOfLines={1}>
											{orgStart.label}
										</Text>
									</Pressable>
								) : null}
								<AddressAutocomplete value={manualStart} onChange={setManualStart} />
								<View style={styles.row}>
									<Button
										title="Cancel"
										variant="secondary"
										size="sm"
										onPress={() => {
											setStartMode("current");
											setManualStart(EMPTY_ADDRESS);
										}}
										style={styles.flexButton}
									/>
									<Button
										title="Set start"
										size="sm"
										onPress={useManualStart}
										style={styles.flexButton}
									/>
								</View>
							</View>
						)}
					</Section>

					{/* Stops */}
					<Section title={`Stops (${draft.stops.length})`} tokens={t}>
						{draft.stops.length === 0 ? (
							<Text style={[styles.emptyText, { color: t.faint }]}>
								Add a stop to build this route.
							</Text>
						) : (
							<View style={styles.group}>
								{draft.stops.map((stop, index) => {
									const client = stop.propertyId
										? propertyById.get(stop.propertyId)
										: undefined;
									const flagged = unreachable.has(index);
									return (
										<View
											key={stop.key}
											style={[
												styles.stopRow,
												{
													borderColor: flagged ? t.danger : t.border,
													backgroundColor: t.card,
												},
											]}
										>
											<View style={[styles.stopIndex, { backgroundColor: t.muted }]}>
												<Text style={[styles.stopIndexText, { color: t.sub }]}>
													{index + 1}
												</Text>
											</View>
											<View style={styles.stopBody}>
												<Text
													style={[styles.stopLabel, { color: t.ink }]}
													numberOfLines={1}
												>
													{stop.label}
												</Text>
												{client ? (
													<Text
														style={[styles.stopSub, { color: t.sub }]}
														numberOfLines={1}
													>
														{client.clientCompanyName}
													</Text>
												) : null}
												{flagged ? (
													<Text style={[styles.stopSub, { color: t.danger }]}>
														Can&apos;t be reached by road from the start
													</Text>
												) : null}
											</View>
											<Pressable
												onPress={() => setDraft(moveStop(draft, stop.key, -1))}
												disabled={index === 0}
												style={[styles.iconBtn, { opacity: index === 0 ? 0.3 : 1 }]}
												accessibilityRole="button"
												accessibilityLabel="Move stop up"
											>
												<ChevronUp size={18} color={t.sub} />
											</Pressable>
											<Pressable
												onPress={() => setDraft(moveStop(draft, stop.key, 1))}
												disabled={index === draft.stops.length - 1}
												style={[
													styles.iconBtn,
													{ opacity: index === draft.stops.length - 1 ? 0.3 : 1 },
												]}
												accessibilityRole="button"
												accessibilityLabel="Move stop down"
											>
												<ChevronDown size={18} color={t.sub} />
											</Pressable>
											<Pressable
												onPress={() => setDraft(removeStop(draft, stop.key))}
												style={styles.iconBtn}
												accessibilityRole="button"
												accessibilityLabel="Remove stop"
											>
												<X size={18} color={t.danger} />
											</Pressable>
										</View>
									);
								})}
							</View>
						)}

						{stopPicker === null ? (
							<Button
								title="Add a stop"
								variant="secondary"
								onPress={() => setStopPicker("list")}
								disabled={atStopLimit}
								style={styles.addStopButton}
							/>
						) : null}
						{atStopLimit ? (
							<Text style={[styles.emptyText, { color: t.faint }]}>
								A route can have at most 23 stops.
							</Text>
						) : null}

						{stopPicker === "list" ? (
							<View style={styles.group}>
								<View
									style={[
										styles.searchRow,
										{ borderColor: t.border, backgroundColor: t.card },
									]}
								>
									<Search size={16} color={t.faint} />
									<TextInput
										value={stopQuery}
										onChangeText={setStopQuery}
										placeholder="Search clients or addresses"
										placeholderTextColor={t.faint}
										style={[styles.searchInput, { color: t.ink }]}
									/>
								</View>
								{filteredProperties.slice(0, 20).map((property) => (
									<Pressable
										key={property._id}
										onPress={() => addProperty(property)}
										style={[
											styles.optionRow,
											{ borderColor: t.border, backgroundColor: t.card },
										]}
										accessibilityRole="button"
									>
										<Text style={[styles.optionTitle, { color: t.ink }]} numberOfLines={1}>
											{property.propertyName ?? property.streetAddress}
										</Text>
										<Text style={[styles.optionSub, { color: t.sub }]} numberOfLines={1}>
											{property.clientCompanyName}
										</Text>
									</Pressable>
								))}
								{filteredProperties.length === 0 ? (
									<Text style={[styles.emptyText, { color: t.faint }]}>
										No matching properties.
									</Text>
								) : null}
								<View style={styles.row}>
									<Pressable
										onPress={() => setStopPicker("address")}
										hitSlop={8}
										accessibilityRole="button"
									>
										<Text style={[styles.changeLink, { color: t.frostedInk }]}>
											Search an address instead
										</Text>
									</Pressable>
									<View style={{ flex: 1 }} />
									<Pressable
										onPress={() => {
											setStopPicker(null);
											setStopQuery("");
										}}
										hitSlop={8}
										accessibilityRole="button"
									>
										<Text style={[styles.changeLink, { color: t.sub }]}>Cancel</Text>
									</Pressable>
								</View>
							</View>
						) : null}

						{stopPicker === "address" ? (
							<View style={styles.group}>
								<AddressAutocomplete
									value={manualStopAddress}
									onChange={setManualStopAddress}
								/>
								<View style={styles.row}>
									<Button
										title="Cancel"
										variant="secondary"
										size="sm"
										onPress={() => {
											setStopPicker(null);
											setManualStopAddress(EMPTY_ADDRESS);
										}}
										style={styles.flexButton}
									/>
									<Button
										title="Add stop"
										size="sm"
										onPress={addManual}
										style={styles.flexButton}
									/>
								</View>
							</View>
						) : null}
					</Section>

					{/* Round trip */}
					<Section title="Round trip" tokens={t}>
						<Toggle2
							value={draft.roundTrip ? "yes" : "no"}
							options={[
								{ value: "yes", label: "Round trip" },
								{ value: "no", label: "One way" },
							]}
							onChange={(v) => setDraft({ ...draft, roundTrip: v === "yes" })}
						/>
					</Section>

					{error ? (
						<Text style={[styles.errorText, { color: t.danger }]}>{error}</Text>
					) : null}
					{computeNote ? (
						<Text style={[styles.errorText, { color: t.warning }]}>
							{computeNote}
						</Text>
					) : null}

					<Button
						title={busy ? "Saving…" : "Save"}
						onPress={onSave}
						disabled={busy}
						icon={busy ? <ActivityIndicator size="small" color="#ffffff" /> : undefined}
						variant="solid"
						style={styles.submit}
					/>

					{showComputeActions ? (
						<>
							<View style={styles.row}>
								<Button
									title="Optimize order"
									onPress={() => onCompute(true)}
									disabled={busy}
									style={styles.flexButton}
								/>
								<Button
									title="Route as listed"
									variant="secondary"
									onPress={() => onCompute(false)}
									disabled={busy}
									style={styles.flexButton}
								/>
							</View>
							<Text style={[styles.note, { color: t.faint }]}>
								Directions clear whenever stops change.
							</Text>
						</>
					) : null}
				</ScrollView>
			</KeyboardAvoidingView>
		</Screen>
	);
}

function Screen({
	isPane,
	title,
	children,
}: {
	isPane: boolean;
	title: string;
	children?: React.ReactNode;
}) {
	const t = useTokens();
	const router = useRouter();
	return (
		<SafeAreaView edges={[]} style={[styles.screen, { backgroundColor: t.bg }]}>
			<DotGrid style={StyleSheet.absoluteFill} />
			{isPane ? (
				<PaneHeader title={title} onBack={() => router.back()} />
			) : (
				<AppHeader mode="detail" title={title} sub="Routes" />
			)}
			{children}
		</SafeAreaView>
	);
}

function Section({
	title,
	tokens,
	children,
}: {
	title: string;
	tokens: ReturnType<typeof useTokens>;
	children: React.ReactNode;
}) {
	return (
		<View style={styles.section}>
			<Text style={[styles.sectionTitle, { color: tokens.ink }]}>{title}</Text>
			<View style={styles.sectionBody}>{children}</View>
		</View>
	);
}

function FieldLabel({
	text,
	tokens,
}: {
	text: string;
	tokens: ReturnType<typeof useTokens>;
}) {
	return <Text style={[styles.fieldLabel, { color: tokens.sub }]}>{text}</Text>;
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
	},
	flex: {
		flex: 1,
	},
	loading: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	content: {
		paddingHorizontal: 16,
		paddingTop: 8,
		paddingBottom: 48,
		gap: 20,
	},
	section: {
		gap: 12,
	},
	sectionTitle: {
		fontFamily: fontFamily.semibold,
		fontSize: type.h3,
		letterSpacing: -0.3,
	},
	sectionBody: {
		gap: 8,
	},
	fieldLabel: {
		fontFamily: fontFamily.medium,
		fontSize: type.sm,
		marginTop: 6,
	},
	input: {
		borderWidth: 1,
		borderRadius: radii.lg,
		paddingHorizontal: 12,
		paddingVertical: 12,
		fontFamily: fontFamily.regular,
		fontSize: 13,
		minHeight: 48,
	},
	group: {
		gap: 8,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	flexButton: {
		flex: 1,
	},
	startRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
	},
	startPin: {
		width: 32,
		height: 32,
		borderRadius: radii.lg,
		alignItems: "center",
		justifyContent: "center",
	},
	startLabel: {
		flex: 1,
		fontFamily: fontFamily.medium,
		fontSize: type.body,
	},
	changeLink: {
		fontFamily: fontFamily.semibold,
		fontSize: type.sm,
	},
	optionRow: {
		borderWidth: 1,
		borderRadius: radii.lg,
		paddingHorizontal: 12,
		paddingVertical: 12,
		minHeight: 44,
		justifyContent: "center",
	},
	optionTitle: {
		fontFamily: fontFamily.semibold,
		fontSize: type.body,
	},
	optionSub: {
		fontFamily: fontFamily.regular,
		fontSize: type.sm,
		marginTop: 2,
	},
	emptyText: {
		fontFamily: fontFamily.regular,
		fontSize: type.sm,
	},
	stopRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		borderWidth: 1,
		borderRadius: radii.lg,
		paddingHorizontal: 10,
		paddingVertical: 8,
	},
	stopIndex: {
		width: 24,
		height: 24,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
	},
	stopIndexText: {
		fontFamily: fontFamily.semibold,
		fontSize: type.xs,
	},
	stopBody: {
		flex: 1,
		minWidth: 0,
	},
	stopLabel: {
		fontFamily: fontFamily.semibold,
		fontSize: type.rowTitle,
	},
	stopSub: {
		fontFamily: fontFamily.regular,
		fontSize: type.sm,
		marginTop: 1,
	},
	iconBtn: {
		width: 44,
		height: 44,
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
	},
	addStopButton: {
		marginTop: 4,
	},
	searchRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		borderWidth: 1,
		borderRadius: radii.lg,
		paddingHorizontal: 12,
		minHeight: 44,
	},
	searchInput: {
		flex: 1,
		fontFamily: fontFamily.regular,
		fontSize: 13,
		paddingVertical: 10,
	},
	errorText: {
		fontFamily: fontFamily.medium,
		fontSize: type.sm,
	},
	submit: {
		marginTop: 8,
	},
	note: {
		fontFamily: fontFamily.regular,
		fontSize: type.xs,
		textAlign: "center",
		marginTop: -4,
	},
});
