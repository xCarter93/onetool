import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Check } from "lucide-react-native";
import {
	AddressAutocomplete,
	type AddressValue,
} from "@/components/AddressAutocomplete.native";
import { CanvasScroll, GUTTER, NOTCH_CLEARANCE, PageHeader } from "@/components/canvas";
import { SheetField, SheetInput } from "@/components/sheets/create-sheet";
import { Button, SegmentedToggle } from "@/components/ui";
import { useDevice } from "@/lib/use-device";
import { useScreenChrome } from "@/lib/shell-chrome";
import { fontFamily, useTokens } from "@/lib/theme";

type CompanySize = "1-10" | "10-100" | "100+";
const COMPANY_SIZES = [
	{ value: "1-10", label: "1-10" },
	{ value: "10-100", label: "10-100" },
	{ value: "100+", label: "100+" },
] as const satisfies { value: CompanySize; label: string }[];

const EMPTY_ADDRESS: AddressValue = {
	streetAddress: "",
	city: "",
	state: "",
	zipCode: "",
};

function sameAddress(a: AddressValue, org: Parameters<typeof buildAddress>[0]): boolean {
	const b = buildAddress(org);
	return (
		a.streetAddress.trim() === b.streetAddress &&
		a.city.trim() === b.city &&
		a.state.trim() === b.state &&
		a.zipCode.trim() === b.zipCode
	);
}

function buildAddress(org: {
	addressStreet?: string | null;
	addressCity?: string | null;
	addressState?: string | null;
	addressZip?: string | null;
}) {
	return {
		streetAddress: org.addressStreet ?? "",
		city: org.addressCity ?? "",
		state: org.addressState ?? "",
		zipCode: org.addressZip ?? "",
	};
}

// Owner-only editor for the org's business profile. This edits an EXISTING org
// the user already belongs to (settings management) — it never creates an org
// and shows no pricing, so it's outside Apple 3.1.1's account-registration scope.
// Reached from the Home "finish setup" prompt and the Profile screen (both
// owner-gated). Saves via completeMetadata, which also sets isMetadataComplete,
// clearing the Home prompt. Save lives in the iPhone tray; iPad has no tray.
/** `onDone` replaces router.back() when the iPad shell hosts this in its Profile pane. */
export default function BusinessDetailsScreen({ onDone }: { onDone?: () => void } = {}) {
	const router = useRouter();
	const t = useTokens();
	const { device } = useDevice();

	const org = useQuery(api.organizations.get);
	const me = useQuery(api.users.current);
	const completeMetadata = useMutation(api.organizations.completeMetadata);

	const isOwner = !!(org && me && org.ownerUserId === me._id);

	// Seed the form once from the org row — render-time, flag-guarded (apps/mobile
	// lints setState-in-effect). Only fills empty fields so typed input is safe.
	const [seeded, setSeeded] = useState(false);
	const [address, setAddress] = useState<AddressValue>(EMPTY_ADDRESS);
	const [email, setEmail] = useState("");
	const [phone, setPhone] = useState("");
	const [website, setWebsite] = useState("");
	const [companySize, setCompanySize] = useState<CompanySize | undefined>();

	const [missing, setMissing] = useState<string[]>([]);
	const [formError, setFormError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	if (!seeded && org) {
		setSeeded(true);
		setAddress({
			streetAddress: org.addressStreet ?? "",
			city: org.addressCity ?? "",
			state: org.addressState ?? "",
			zipCode: org.addressZip ?? "",
			country: org.addressCountry ?? undefined,
			latitude: org.latitude ?? undefined,
			longitude: org.longitude ?? undefined,
		});
		if (org.email) setEmail(org.email);
		if (org.phone) setPhone(org.phone);
		if (org.website) setWebsite(org.website);
		if (org.companySize) setCompanySize(org.companySize as CompanySize);
	}

	const isDirty = useMemo(() => {
		if (!org) return false;
		return (
			!sameAddress(address, org) ||
			email.trim() !== (org.email ?? "") ||
			phone.trim() !== (org.phone ?? "") ||
			website.trim() !== (org.website ?? "") ||
			companySize !== (org.companySize as CompanySize | undefined)
		);
	}, [address, email, phone, website, companySize, org]);

	const isValid =
		!!address.streetAddress.trim() &&
		!!address.city.trim() &&
		!!address.state.trim() &&
		!!address.zipCode.trim() &&
		!!email.trim() &&
		!!phone.trim() &&
		!!companySize;

	const handleSave = useCallback(async () => {
		const missingFields: string[] = [];
		if (!address.streetAddress.trim()) missingFields.push("street");
		if (!address.city.trim()) missingFields.push("city");
		if (!address.state.trim()) missingFields.push("state");
		if (!address.zipCode.trim()) missingFields.push("zip");
		if (!email.trim()) missingFields.push("email");
		if (!phone.trim()) missingFields.push("phone");
		if (!companySize) missingFields.push("companySize");
		if (missingFields.length > 0) {
			setMissing(missingFields);
			return;
		}
		setMissing([]);
		setFormError(null);
		setSubmitting(true);
		try {
			await completeMetadata({
				email: email.trim(),
				phone: phone.trim(),
				website: website.trim() || undefined,
				addressStreet: address.streetAddress.trim(),
				addressCity: address.city.trim(),
				addressState: address.state.trim(),
				addressZip: address.zipCode.trim(),
				addressCountry: address.country,
				latitude: address.latitude,
				longitude: address.longitude,
				companySize,
			});
			if (onDone) onDone();
			else router.back();
		} catch {
			setFormError("Couldn't save your business details. Try again.");
			setSubmitting(false);
		}
	}, [address, email, phone, website, companySize, completeMetadata, router, onDone]);

	const canSave = isOwner && org !== undefined && org !== null;
	const disabledReason = submitting
		? "Saving…"
		: !isDirty
			? "No changes to save"
			: !isValid
				? "Fill in the required fields"
				: undefined;

	useScreenChrome(
		canSave
			? {
					tray: [
						{
							key: "save",
							label: "Save",
							icon: Check,
							onPress: () => void handleSave(),
							disabledReason,
						},
					],
				}
			: null,
	);

	// Loading the org row.
	if (org === undefined || me === undefined) {
		return (
			<View style={styles.screen}>
				<View style={styles.stateHeader}>
					<PageHeader title="Business details" />
				</View>
				<View style={styles.center}>
					<Text style={[styles.muted, { color: t.sub }]}>Loading…</Text>
				</View>
			</View>
		);
	}

	// No active org (get() returns null, e.g. deep-linked here without one). This
	// is a routing dead-end, NOT an authorization failure — say so accurately
	// rather than falling through to the owner-only message below.
	if (org === null) {
		return (
			<View style={styles.screen}>
				<View style={styles.stateHeader}>
					<PageHeader title="Business details" />
				</View>
				<View style={styles.center}>
					<Text style={[styles.muted, { color: t.sub }]}>
						No active workspace. Open one first, then edit its business details.
					</Text>
				</View>
			</View>
		);
	}

	// Defensive: entry points are owner-gated, but block a non-owner who reaches
	// this route directly — only the owner can save (backend enforces it too).
	if (!isOwner) {
		return (
			<View style={styles.screen}>
				<View style={styles.stateHeader}>
					<PageHeader title="Business details" />
				</View>
				<View style={styles.center}>
					<Text style={[styles.muted, { color: t.sub }]}>
						Only the organization owner can edit business details.
					</Text>
				</View>
			</View>
		);
	}

	return (
		<View style={styles.screen}>
			<CanvasScroll contentContainerStyle={{ gap: 20 }}>
				<PageHeader
					title="Business details"
					subtitle="Used on your quotes and invoices. Only the owner can edit these."
				/>
				<SheetField label="Address">
					<AddressAutocomplete value={address} onChange={setAddress} />
				</SheetField>
				<SheetField label="Business email">
					<SheetInput
						value={email}
						onChangeText={setEmail}
						placeholder="you@business.com"
						editable={!submitting}
						autoCapitalize="none"
						keyboardType="email-address"
					/>
				</SheetField>
				<SheetField label="Phone">
					<SheetInput
						value={phone}
						onChangeText={setPhone}
						placeholder="(555) 555-5555"
						editable={!submitting}
						keyboardType="phone-pad"
					/>
				</SheetField>
				<SheetField label="Website" hint="Optional">
					<SheetInput
						value={website}
						onChangeText={setWebsite}
						placeholder="https://"
						editable={!submitting}
						autoCapitalize="none"
						keyboardType="url"
					/>
				</SheetField>
				<SheetField label="Team size">
					<SegmentedToggle<CompanySize | "">
						segments={COMPANY_SIZES}
						value={companySize ?? ""}
						onChange={(v) => setCompanySize(v === "" ? undefined : v)}
					/>
				</SheetField>

				{missing.length > 0 ? (
					<Text style={[styles.errorText, { color: t.danger }]}>Please fill in the required fields.</Text>
				) : null}
				{formError ? <Text style={[styles.errorText, { color: t.danger }]}>{formError}</Text> : null}
				{device === "ipad" ? (
					<Button
						title={submitting ? "Saving…" : "Save"}
						onPress={() => void handleSave()}
						disabled={!!disabledReason}
					/>
				) : null}
			</CanvasScroll>
		</View>
	);
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
	},
	stateHeader: {
		paddingHorizontal: GUTTER,
		paddingTop: NOTCH_CLEARANCE,
	},
	center: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 24,
	},
	muted: {
		fontFamily: fontFamily.regular,
		fontSize: 14,
		textAlign: "center",
	},
	errorText: {
		fontFamily: fontFamily.regular,
		fontSize: 13,
	},
});
