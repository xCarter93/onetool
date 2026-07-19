import { useState } from "react";
import {
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Check } from "lucide-react-native";
import {
	AddressAutocomplete,
	type AddressValue,
} from "@/components/AddressAutocomplete.native";
import { Card } from "@/components/ui";
import { StyledButton } from "@/components/styled";
import { fontFamily, radii, spacing, tokens, type } from "@/lib/theme";

type CompanySize = "1-10" | "10-100" | "100+";
const COMPANY_SIZES: CompanySize[] = ["1-10", "10-100", "100+"];

const EMPTY_ADDRESS: AddressValue = {
	streetAddress: "",
	city: "",
	state: "",
	zipCode: "",
};

// Owner-only editor for the org's business profile. This edits an EXISTING org
// the user already belongs to (settings management) — it never creates an org
// and shows no pricing, so it's outside Apple 3.1.1's account-registration scope.
// Reached from the Home "finish setup" prompt and the Profile screen (both
// owner-gated). Saves via completeMetadata, which also sets isMetadataComplete,
// clearing the Home prompt.
export default function BusinessDetailsScreen() {
	const insets = useSafeAreaInsets();
	const router = useRouter();

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

	async function handleSave() {
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
			router.back();
		} catch {
			setFormError("Couldn't save your business details. Try again.");
			setSubmitting(false);
		}
	}

	// Loading the org row.
	if (org === undefined || me === undefined) {
		return (
			<View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
				<Text style={styles.mutedBody}>Loading…</Text>
			</View>
		);
	}

	// No active org (get() returns null, e.g. deep-linked here without one). This
	// is a routing dead-end, NOT an authorization failure — say so accurately
	// rather than falling through to the owner-only message below.
	if (org === null) {
		return (
			<View
				style={[
					styles.screen,
					styles.center,
					{ paddingTop: insets.top, paddingBottom: insets.bottom + spacing.lg },
				]}
			>
				<View style={styles.box}>
					<Text style={styles.title}>Business details</Text>
					<Text style={styles.mutedBody}>
						No active workspace. Open one first, then edit its business details.
					</Text>
					<View style={styles.cta}>
						<StyledButton
							intent="outline"
							label="Back"
							showArrow={false}
							onPress={() => router.back()}
						/>
					</View>
				</View>
			</View>
		);
	}

	// Defensive: entry points are owner-gated, but block a non-owner who reaches
	// this route directly — only the owner can save (backend enforces it too).
	if (!isOwner) {
		return (
			<View
				style={[
					styles.screen,
					styles.center,
					{ paddingTop: insets.top, paddingBottom: insets.bottom + spacing.lg },
				]}
			>
				<View style={styles.box}>
					<Text style={styles.title}>Business details</Text>
					<Text style={styles.mutedBody}>
						Only the organization owner can edit business details.
					</Text>
					<View style={styles.cta}>
						<StyledButton
							intent="outline"
							label="Back"
							showArrow={false}
							onPress={() => router.back()}
						/>
					</View>
				</View>
			</View>
		);
	}

	return (
		<View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
			<ScrollView
				contentContainerStyle={styles.scroll}
				keyboardShouldPersistTaps="handled"
			>
				<Text style={styles.title}>Business details</Text>
				<Text style={styles.subtitle}>
					Used on your quotes and invoices. Only the owner can edit these.
				</Text>

				<View style={styles.stepBody}>
					<AddressAutocomplete value={address} onChange={setAddress} />
					<TextInput
						value={email}
						onChangeText={setEmail}
						placeholder="Business email"
						placeholderTextColor={tokens.faint}
						editable={!submitting}
						style={styles.input}
						autoCapitalize="none"
						keyboardType="email-address"
					/>
					<TextInput
						value={phone}
						onChangeText={setPhone}
						placeholder="Phone"
						placeholderTextColor={tokens.faint}
						editable={!submitting}
						style={styles.input}
						keyboardType="phone-pad"
					/>
					<TextInput
						value={website}
						onChangeText={setWebsite}
						placeholder="Website (optional)"
						placeholderTextColor={tokens.faint}
						editable={!submitting}
						style={styles.input}
						autoCapitalize="none"
						keyboardType="url"
					/>
				</View>

				<Text style={styles.sizeHeading}>How big is your team?</Text>
				<View style={styles.stepBody}>
					{COMPANY_SIZES.map((size) => {
						const selected = companySize === size;
						return (
							<Pressable
								key={size}
								onPress={() => !submitting && setCompanySize(size)}
								disabled={submitting}
							>
								<Card
									style={[
										styles.sizeRow,
										{ borderColor: selected ? tokens.accent : tokens.border },
									]}
								>
									<Text style={styles.sizeLabel}>{size}</Text>
									{selected ? <Check size={18} color={tokens.accent} /> : null}
								</Card>
							</Pressable>
						);
					})}
				</View>

				{missing.length > 0 ? (
					<Text style={styles.errorText}>
						Please fill in the required fields.
					</Text>
				) : null}
				{formError ? <Text style={styles.errorText}>{formError}</Text> : null}
			</ScrollView>

			<View
				style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}
			>
				<View style={styles.footerHalf}>
					<StyledButton
						intent="outline"
						label="Cancel"
						showArrow={false}
						disabled={submitting}
						onPress={() => router.back()}
					/>
				</View>
				<View style={styles.footerHalf}>
					<StyledButton
						intent="primary"
						label="Save"
						showArrow={false}
						isLoading={submitting}
						onPress={handleSave}
					/>
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
		backgroundColor: tokens.bg,
		paddingHorizontal: spacing.lg,
	},
	center: {
		alignItems: "center",
		justifyContent: "center",
	},
	box: {
		alignItems: "center",
		gap: spacing.sm,
		paddingHorizontal: spacing.lg,
		maxWidth: 420,
	},
	scroll: {
		paddingBottom: spacing.xl,
	},
	title: {
		fontFamily: fontFamily.bold,
		fontSize: type.h1,
		color: tokens.ink,
		textAlign: "center",
	},
	subtitle: {
		fontFamily: fontFamily.regular,
		fontSize: type.h4,
		color: tokens.sub,
		marginTop: spacing.xs,
		textAlign: "center",
	},
	stepBody: {
		marginTop: spacing.md,
		gap: spacing.md,
	},
	sizeHeading: {
		fontFamily: fontFamily.bold,
		fontSize: type.h3,
		color: tokens.ink,
		marginTop: spacing.xl,
	},
	input: {
		borderWidth: 1,
		borderColor: tokens.border,
		backgroundColor: tokens.card,
		borderRadius: radii.lg,
		paddingHorizontal: 12,
		paddingVertical: 12,
		fontFamily: fontFamily.regular,
		fontSize: type.body,
		color: tokens.ink,
		minHeight: 48,
	},
	sizeRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		borderWidth: 1,
		minHeight: 44,
		padding: spacing.md,
	},
	sizeLabel: {
		fontFamily: fontFamily.bold,
		fontSize: type.h4,
		color: tokens.ink,
	},
	errorText: {
		fontFamily: fontFamily.regular,
		fontSize: type.body,
		color: tokens.danger,
		marginTop: spacing.sm,
	},
	mutedBody: {
		fontFamily: fontFamily.regular,
		fontSize: type.h4,
		color: tokens.sub,
		textAlign: "center",
	},
	footer: {
		flexDirection: "row",
		gap: spacing.md,
		paddingTop: spacing.md,
	},
	footerHalf: {
		flex: 1,
	},
	cta: {
		marginTop: spacing.lg,
		alignSelf: "stretch",
	},
});
