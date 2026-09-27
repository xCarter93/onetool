import { useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";
import { Redirect, useRouter } from "expo-router";
import { useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Id } from "@onetool/backend/convex/_generated/dataModel";
import { colors, fontFamily, useTokens } from "@/lib/theme";
import { Button } from "@/components/ui";
import { describeMutationError } from "@/lib/mutation-error";
import {
	AddressAutocomplete,
	type AddressValue,
} from "@/components/AddressAutocomplete.native";
import { FieldMenu } from "@/components/FieldMenu";
import { useOnlineAction } from "@/lib/offline/hooks";
import { usePermissions } from "@/lib/use-permissions";
import { hapticSuccess } from "@/lib/haptics";
import { CreateSheet, SheetField, SheetInput } from "@/components/sheets/create-sheet";

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

export default function NewClientSheet() {
	const t = useTokens();
	const router = useRouter();
	const onlineAction = useOnlineAction();
	const { can, isLoading: permsLoading } = usePermissions();

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
			// (2) Create the client first. The portal access id is minted server-side
			// (SEC-5). await defends a Promise (Pitfall 1).
			const clientId = (await Promise.resolve(
				createClient({
					companyName: companyName.trim(),
					status,
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
			hapticSuccess();
			router.replace(`/clients/${clientId}`);
		} catch (err) {
			console.error("Client create failed:", err);
			const { message, planLimit } = describeMutationError(
				err,
				"Couldn't save your changes. Check your connection and try again."
			);
			// Plan-limit copy renders as-is — no directional upsell text on
			// mobile (Apple anti-steering).
			Alert.alert(planLimit ? "Plan limit reached" : "Couldn't save", message, [
				{ text: "OK" },
			]);
		} finally {
			setSubmitting(false);
		}
	};

	if (!permsLoading && !can("clients", "modify")) return <Redirect href="/work" />;

	return (
		<CreateSheet
			kind="client"
			title="New client"
			subtitle="Company, primary contact and property"
			onClose={() => router.back()}
			footer={
				<Button
					title={submitting ? "Creating…" : "Create client"}
					onPress={() => onlineAction("Creating a client", handleSubmit)}
					disabled={submitting}
					icon={
						submitting ? (
							<ActivityIndicator size="small" color={colors.primaryForeground} />
						) : undefined
					}
				/>
			}
		>
			<Text style={[styles.section, { color: t.sub }]}>Client</Text>
			<SheetField label="Company name" error={showCompanyError ? "Company name is required." : null}>
				<SheetInput
					value={companyName}
					onChangeText={(v) => {
						setCompanyName(v);
						if (showCompanyError) setShowCompanyError(false);
					}}
					placeholder="Acme Cleaning Co."
					autoCapitalize="words"
					invalid={showCompanyError}
				/>
			</SheetField>
			<SheetField label="Status">
				<FieldMenu
					title="Client status"
					value={status}
					options={STATUS_OPTIONS}
					label={statusLabel}
					onSelect={(next) => setStatus(next as ClientStatus)}
				/>
			</SheetField>
			<SheetField label="Notes" hint="Optional">
				<SheetInput
					value={notes}
					onChangeText={setNotes}
					placeholder="Anything worth remembering"
					multiline
				/>
			</SheetField>

			<Text style={[styles.section, { color: t.sub }]}>Primary contact</Text>
			<View style={styles.row}>
				<SheetField label="First name" style={styles.half}>
					<SheetInput
						value={firstName}
						onChangeText={(v) => {
							setFirstName(v);
							if (showContactError) setShowContactError(false);
						}}
						placeholder="Jane"
						autoCapitalize="words"
						invalid={showContactError}
					/>
				</SheetField>
				<SheetField label="Last name" style={styles.half}>
					<SheetInput
						value={lastName}
						onChangeText={(v) => {
							setLastName(v);
							if (showContactError) setShowContactError(false);
						}}
						placeholder="Doe"
						autoCapitalize="words"
						invalid={showContactError}
					/>
				</SheetField>
			</View>
			{showContactError ? (
				<Text style={[styles.error, { color: t.danger }]}>Contact name is required.</Text>
			) : null}
			<SheetField label="Email" hint="Optional">
				<SheetInput
					value={email}
					onChangeText={setEmail}
					placeholder="jane@example.com"
					autoCapitalize="none"
					keyboardType="email-address"
					autoCorrect={false}
				/>
			</SheetField>
			<SheetField label="Phone" hint="Optional">
				<SheetInput
					value={phone}
					onChangeText={setPhone}
					placeholder="(555) 123-4567"
					keyboardType="phone-pad"
				/>
			</SheetField>

			<Text style={[styles.section, { color: t.sub }]}>Primary property</Text>
			<SheetField label="Address" error={showAddressError ? "A full address is required." : null}>
				<AddressAutocomplete
					value={address}
					onChange={(next) => {
						setAddress(next);
						if (showAddressError) setShowAddressError(false);
					}}
				/>
			</SheetField>
		</CreateSheet>
	);
}

const styles = StyleSheet.create({
	section: {
		fontFamily: fontFamily.semibold,
		fontSize: 11,
		letterSpacing: 0.9,
		textTransform: "uppercase",
		marginBottom: -6,
	},
	row: {
		flexDirection: "row",
		gap: 8,
	},
	half: {
		flex: 1,
	},
	error: {
		fontFamily: fontFamily.regular,
		fontSize: 12.5,
		marginTop: -10,
	},
});
