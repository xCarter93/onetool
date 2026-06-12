import { useState } from "react";
import {
	ActivityIndicator,
	Alert,
	KeyboardAvoidingView,
	Platform,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Id } from "@onetool/backend/convex/_generated/dataModel";
import * as Crypto from "expo-crypto";
import { fontFamily, radii, type, useTokens } from "@/lib/theme";
import { AppHeader } from "@/components/app-header";
import { PaneHeader } from "@/components/ipad/pane-header";
import { Button } from "@/components/ui";
import { useDevice } from "@/lib/use-device";
import {
	AddressAutocomplete,
	type AddressValue,
} from "@/components/AddressAutocomplete.native";
import { FieldMenu } from "@/components/FieldMenu";

type ClientStatus = "lead" | "active" | "inactive" | "archived";

const STATUS_OPTIONS: { value: ClientStatus; label: string }[] = [
	{ value: "lead", label: "Lead" },
	{ value: "active", label: "Active" },
	{ value: "inactive", label: "Inactive" },
	{ value: "archived", label: "Archived" },
];

const EMPTY_ADDRESS: AddressValue = {
	streetAddress: "",
	city: "",
	state: "",
	zipCode: "",
};

// headerMode defaults "root" → iPhone full-screen create is byte-identical. On
// iPad the shell renders this body IN-PANE (no router.push to a (tabs) sibling,
// which would slide the whole shell); headerMode="pane" suppresses the self-
// mounted AppHeader so the pane owns one header (PaneHeader with a back
// affordance dismisses to the list). onDone fires after a successful create
// (newId) or a cancel (undefined): the shell uses it to exit the create surface
// and open the new client in the detail pane. On iPhone onDone is absent → the
// body routes itself (router.replace to the new client / router.back on cancel).
export function ClientCreateBody({
	headerMode,
	onDone,
}: {
	headerMode?: "root" | "pane";
	onDone?: (newId?: string) => void;
} = {}) {
	const t = useTokens();
	const router = useRouter();
	const { device } = useDevice();
	// No explicit headerMode (iPhone route) → self-detect; the shell passes "pane".
	const isPane = headerMode ? headerMode === "pane" : device === "ipad";

	const createClient = useMutation(api.clients.create);
	const createContact = useMutation(api.clientContacts.create);
	const createProperty = useMutation(api.clientProperties.create);

	// Section 1 — client
	const [companyName, setCompanyName] = useState("");
	const [status, setStatus] = useState<ClientStatus>("lead");
	const [notes, setNotes] = useState("");

	// Section 2 — primary contact
	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");
	const [email, setEmail] = useState("");
	const [phone, setPhone] = useState("");

	// Section 3 — primary property
	const [address, setAddress] = useState<AddressValue>(EMPTY_ADDRESS);

	// Submit state + per-group validation hints (shown only after a submit attempt).
	const [submitting, setSubmitting] = useState(false);
	const [showCompanyError, setShowCompanyError] = useState(false);
	const [showContactError, setShowContactError] = useState(false);
	const [showAddressError, setShowAddressError] = useState(false);

	const statusLabel =
		STATUS_OPTIONS.find((o) => o.value === status)?.label ?? "Lead";

	const handleSubmit = async () => {
		if (submitting) return;

		// (1) Validate ALL required fields client-side BEFORE any mutation runs
		// (prevents the half-created orphan-client failure mode — RESEARCH Pitfall 4).
		const companyOk = companyName.trim().length > 0;
		const contactOk = firstName.trim().length > 0 && lastName.trim().length > 0;
		const addressOk =
			address.streetAddress.trim().length > 0 &&
			address.city.trim().length > 0 &&
			address.state.trim().length > 0 &&
			address.zipCode.trim().length > 0;

		setShowCompanyError(!companyOk);
		setShowContactError(!contactOk);
		setShowAddressError(!addressOk);

		if (!companyOk || !contactOk || !addressOk) return;

		setSubmitting(true);
		const warnings: string[] = [];

		try {
			// (2) Create the client first. portalAccessId is a crypto-strong RFC4122
			// v4 (Convex retries mutations; non-deterministic UUIDs are unsafe, T-21-02).
			// randomUUID is sync per MAPBOX-SPIKE.md; await defends a Promise (Pitfall 1).
			const clientId = (await Promise.resolve(
				createClient({
					companyName: companyName.trim(),
					status,
					portalAccessId: Crypto.randomUUID(),
					notes: notes.trim() || undefined,
				})
			)) as Id<"clients">;

			// (3) Primary contact — non-blocking. Validated above, so this catch
			// only fires on an UNEXPECTED server/network failure, not empty input.
			try {
				await createContact({
					clientId,
					firstName: firstName.trim(),
					lastName: lastName.trim(),
					email: email.trim() || undefined,
					phone: phone.trim() || undefined,
					isPrimary: true,
				});
			} catch (err) {
				console.error("Contact create failed:", err);
				warnings.push("Contact could not be saved — add it later.");
			}

			// (4) Primary property — non-blocking, same rationale.
			try {
				await createProperty({
					clientId,
					streetAddress: address.streetAddress.trim(),
					city: address.city.trim(),
					state: address.state.trim(),
					zipCode: address.zipCode.trim(),
					country: address.country?.trim() || undefined,
					latitude: address.latitude ?? undefined,
					longitude: address.longitude ?? undefined,
					formattedAddress: address.formattedAddress || undefined,
					isPrimary: true,
				});
			} catch (err) {
				console.error("Property create failed:", err);
				warnings.push("Property could not be saved — add it later.");
			}

			// (5) Navigate regardless — the client exists. Surface any sub-record
			// warnings so the user knows what to re-enter on the detail screen.
			if (warnings.length > 0) {
				Alert.alert("Client created", warnings.join("\n"), [{ text: "OK" }]);
			}
			// In-shell (iPad): hand the new id to the shell so it exits create and
			// opens the client in the detail pane. iPhone: route to the detail screen.
			if (onDone) onDone(clientId);
			else router.replace(`/clients/${clientId}`);
		} catch (err) {
			console.error("Client create failed:", err);
			Alert.alert(
				"Couldn't save",
				"Couldn't save your changes. Check your connection and try again.",
				[{ text: "OK" }]
			);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<SafeAreaView
			edges={[]}
			style={[styles.screen, { backgroundColor: t.bg }]}
		>
			{/* Pane mode (iPad full-width stack slot): one header, with a back
			    affordance to the clients list. iPhone: AppHeader (byte-identical). */}
			{isPane ? (
				<PaneHeader
					title="New client"
					onBack={() => (onDone ? onDone() : router.back())}
				/>
			) : (
				<AppHeader mode="detail" title="New client" sub="Clients" />
			)}
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
					{/* Section 1 — Client */}
					<Section title="Client" tokens={t}>
						<FieldLabel text="Company name" tokens={t} />
						<TextInput
							value={companyName}
							onChangeText={(v) => {
								setCompanyName(v);
								if (showCompanyError) setShowCompanyError(false);
							}}
							placeholder="Acme Cleaning Co."
							placeholderTextColor={t.faint}
							style={[
								styles.input,
								{ borderColor: t.border, backgroundColor: t.card, color: t.ink },
							]}
							autoCapitalize="words"
						/>
						{showCompanyError ? (
							<Text style={[styles.hint, { color: t.danger }]}>
								Company name is required.
							</Text>
						) : null}

						<FieldLabel text="Status" tokens={t} />
						<FieldMenu
							title="Client status"
							value={status}
							options={STATUS_OPTIONS}
							label={statusLabel}
							onSelect={(next) => setStatus(next as ClientStatus)}
						/>

						<FieldLabel text="Notes (optional)" tokens={t} />
						<TextInput
							value={notes}
							onChangeText={setNotes}
							placeholder="Anything worth remembering"
							placeholderTextColor={t.faint}
							style={[
								styles.input,
								styles.multiline,
								{ borderColor: t.border, backgroundColor: t.card, color: t.ink },
							]}
							multiline
							textAlignVertical="top"
						/>
					</Section>

					{/* Section 2 — Primary contact */}
					<Section title="Primary contact" tokens={t}>
						<View style={styles.row}>
							<View style={styles.half}>
								<FieldLabel text="First name" tokens={t} />
								<TextInput
									value={firstName}
									onChangeText={(v) => {
										setFirstName(v);
										if (showContactError) setShowContactError(false);
									}}
									placeholder="Jane"
									placeholderTextColor={t.faint}
									style={[
										styles.input,
										{ borderColor: t.border, backgroundColor: t.card, color: t.ink },
									]}
									autoCapitalize="words"
								/>
							</View>
							<View style={styles.half}>
								<FieldLabel text="Last name" tokens={t} />
								<TextInput
									value={lastName}
									onChangeText={(v) => {
										setLastName(v);
										if (showContactError) setShowContactError(false);
									}}
									placeholder="Doe"
									placeholderTextColor={t.faint}
									style={[
										styles.input,
										{ borderColor: t.border, backgroundColor: t.card, color: t.ink },
									]}
									autoCapitalize="words"
								/>
							</View>
						</View>
						{showContactError ? (
							<Text style={[styles.hint, { color: t.danger }]}>
								Contact name is required.
							</Text>
						) : null}

						<FieldLabel text="Email (optional)" tokens={t} />
						<TextInput
							value={email}
							onChangeText={setEmail}
							placeholder="jane@example.com"
							placeholderTextColor={t.faint}
							style={[
								styles.input,
								{ borderColor: t.border, backgroundColor: t.card, color: t.ink },
							]}
							autoCapitalize="none"
							keyboardType="email-address"
							autoCorrect={false}
						/>

						<FieldLabel text="Phone (optional)" tokens={t} />
						<TextInput
							value={phone}
							onChangeText={setPhone}
							placeholder="(555) 123-4567"
							placeholderTextColor={t.faint}
							style={[
								styles.input,
								{ borderColor: t.border, backgroundColor: t.card, color: t.ink },
							]}
							keyboardType="phone-pad"
						/>
					</Section>

					{/* Section 3 — Primary property */}
					<Section title="Primary property" tokens={t}>
						<AddressAutocomplete
							value={address}
							onChange={(next) => {
								setAddress(next);
								if (showAddressError) setShowAddressError(false);
							}}
						/>
						{showAddressError ? (
							<Text style={[styles.hint, { color: t.danger }]}>
								A full address is required.
							</Text>
						) : null}
					</Section>

					<Button
						title={submitting ? "Creating..." : "Create client"}
						onPress={handleSubmit}
						disabled={submitting}
						icon={
							submitting ? (
								<ActivityIndicator size="small" color="#ffffff" />
							) : undefined
						}
						style={styles.submit}
					/>
				</ScrollView>
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
}

// Thin iPhone route wrapper — renders the body self-detecting headerMode and
// routing itself (router.replace to the new client / router.back on cancel).
// Byte-identical to the previous full-screen create. The iPad shell imports
// ClientCreateBody directly with headerMode="pane" + onDone.
export default function NewClientScreen() {
	return <ClientCreateBody />;
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
	return (
		<Text style={[styles.fieldLabel, { color: tokens.sub }]}>{text}</Text>
	);
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
	},
	flex: {
		flex: 1,
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
	multiline: {
		minHeight: 88,
		paddingTop: 12,
	},
	row: {
		flexDirection: "row",
		gap: 8,
	},
	half: {
		flex: 1,
	},
	hint: {
		fontFamily: fontFamily.medium,
		fontSize: type.sm,
		marginTop: 2,
	},
	submit: {
		marginTop: 8,
	},
});
