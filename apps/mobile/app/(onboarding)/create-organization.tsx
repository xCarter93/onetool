import React, { useEffect, useRef, useState } from "react";
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
import { useAuth, useOrganization, useOrganizationList } from "@clerk/expo";
import { useMutation, useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Check } from "lucide-react-native";
import {
	AddressAutocomplete,
	type AddressValue,
} from "@/components/AddressAutocomplete.native";
import { Card, Eyebrow } from "@/components/ui";
import { StyledButton } from "@/components/styled";
import { fontFamily, radii, spacing, tokens, type } from "@/lib/theme";
import {
	canWriteMetadata,
	isSetupTimedOut,
	shouldRetryOrgCreate,
	validateStep1,
	validateStep2,
	validateStep3,
} from "@/lib/wizardValidation";
import {
	navigateAfterAuth,
	resolveAuthDestination,
} from "@/lib/postAuthRouting";

type Step = 1 | 2 | 3;
type CompanySize = "1-10" | "10-100" | "100+";

const STEP_TITLES: Record<Step, string> = {
	1: "Name your organization",
	2: "Business details",
	3: "How big is your team?",
};

const SETUP_TIMEOUT_MS = 30000;
const COMPANY_SIZES: CompanySize[] = ["1-10", "10-100", "100+"];

const EMPTY_ADDRESS: AddressValue = {
	streetAddress: "",
	city: "",
	state: "",
	zipCode: "",
};

export default function CreateOrganizationScreen() {
	const insets = useSafeAreaInsets();
	const router = useRouter();

	// --- Auth / org hooks ---------------------------------------------------
	const { isLoaded: authLoaded, isSignedIn } = useAuth();
	const { organization: activeOrg } = useOrganization();
	const { createOrganization, setActive, userMemberships, isLoaded } =
		useOrganizationList({ userMemberships: true });

	// --- Convex precondition + race-gate sources ----------------------------
	// convexUser: null until the user.created webhook syncs the user row.
	//   createFromClerk throws "Owner user not found" if we create the org first.
	const convexUser = useQuery(api.users.current);
	// convexOrg: null until organization.created -> createFromClerk syncs the row.
	const convexOrg = useQuery(api.organizations.get);
	const needsMetadata = useQuery(api.organizations.needsMetadataCompletion);
	const completeMetadata = useMutation(api.organizations.completeMetadata);

	// --- Wizard state -------------------------------------------------------
	const [step, setStep] = useState<Step>(1);
	const [fieldErrors, setFieldErrors] = useState<string[]>([]);
	const [formError, setFormError] = useState<string | null>(null);

	// Step-1
	const [orgName, setOrgName] = useState("");
	// Step-2
	const [address, setAddress] = useState<AddressValue>(EMPTY_ADDRESS);
	const [email, setEmail] = useState("");
	const [phone, setPhone] = useState("");
	const [website, setWebsite] = useState("");
	// Step-3
	const [companySize, setCompanySize] = useState<CompanySize | undefined>();

	// --- Webhook-race / setup state -----------------------------------------
	// createdOrgRef holds the Clerk org id created (or reused) this session; it
	// gates the org-id-match race predicate and the no-duplicate retry path.
	const createdOrgRef = useRef<string | null>(null);
	const [createdOrgId, setCreatedOrgId] = useState<string | null>(null);
	const [settingUp, setSettingUp] = useState(false);
	const [setupStartedAt, setSetupStartedAt] = useState<number | null>(null);
	const [timedOut, setTimedOut] = useState(false);
	const [submitting, setSubmitting] = useState(false);

	// The reactive Convex row flips to the matching org once createFromClerk
	// inserts it — org-id MATCH, not mere non-null (canWriteMetadata).
	const metadataReady = canWriteMetadata(convexOrg, createdOrgId);

	// While "setting up", advance to step 2 the moment the matching row appears.
	// Done during render (sentinel pattern, not an effect) so the overlay->step-2
	// transition has no setState-in-effect cascade.
	if (settingUp && metadataReady) {
		setSettingUp(false);
		setTimedOut(false);
		setSetupStartedAt(null);
		if (step === 1) setStep(2);
	}

	// 30s timeout tick — surfaces the recovery copy distinctly from the spinner.
	useEffect(() => {
		if (!settingUp || setupStartedAt == null) return;
		const id = setInterval(() => {
			if (isSetupTimedOut(Date.now() - setupStartedAt, SETUP_TIMEOUT_MS)) {
				setTimedOut(true);
			}
		}, 1000);
		return () => clearInterval(id);
	}, [settingUp, setupStartedAt]);

	// --- Org creation (membership-aware + no-duplicate retry) ----------------
	async function runOrgCreate() {
		setFormError(null);
		setTimedOut(false);
		try {
			const memberships = userMemberships?.data ?? [];
			const existingOrgId = memberships[0]?.organization?.id ?? null;

			if (memberships.length > 0 && existingOrgId) {
				// Existing member with no active org: set the first membership active
				// instead of creating a duplicate org.
				if (setActive) await setActive({ organization: existingOrgId });
				createdOrgRef.current = existingOrgId;
			} else if (!shouldRetryOrgCreate({ createdOrgId: createdOrgRef.current })) {
				// Retry path: an org was already created this session — re-wait, do
				// NOT create a duplicate.
			} else {
				if (!createOrganization || !setActive) {
					throw new Error("Clerk is not ready");
				}
				const org = await createOrganization({ name: orgName.trim() });
				createdOrgRef.current = org.id;
				await setActive({ organization: org.id });
			}

			setCreatedOrgId(createdOrgRef.current);
			setSettingUp(true);
			setSetupStartedAt(Date.now());
		} catch {
			setSettingUp(false);
			setFormError("Couldn't create your organization. Try again.");
		}
	}

	function handleStep1Continue() {
		const result = validateStep1({ orgName });
		if (!result.valid) {
			setFieldErrors(result.fields);
			return;
		}
		setFieldErrors([]);

		// PRECONDITION: wait for the Convex user row before creating the org —
		// otherwise createFromClerk's owner lookup throws and organizations.get
		// stays null forever.
		if (convexUser == null) {
			setSettingUp(true);
			setSetupStartedAt(Date.now());
			// runOrgCreate re-fires from the effect below once convexUser syncs.
			return;
		}
		void runOrgCreate();
	}

	// Once the user row syncs while we're waiting on the precondition, kick off
	// the create (only if we haven't created/reused an org yet this session).
	useEffect(() => {
		if (
			settingUp &&
			step === 1 &&
			convexUser != null &&
			createdOrgRef.current == null &&
			!metadataReady
		) {
			void runOrgCreate();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [settingUp, step, convexUser, metadataReady]);

	function handleRetry() {
		setTimedOut(false);
		setSetupStartedAt(Date.now());
		// createdOrgRef.current is set, so shouldRetryOrgCreate returns false and
		// runOrgCreate re-waits instead of creating a duplicate org.
		void runOrgCreate();
	}

	function handleAdvance() {
		if (step === 1) {
			handleStep1Continue();
			return;
		}
		if (step === 2) {
			const result = validateStep2({
				streetAddress: address.streetAddress,
				city: address.city,
				state: address.state,
				zipCode: address.zipCode,
				email,
				phone,
				website,
			});
			if (!result.valid) {
				setFieldErrors(result.fields);
				return;
			}
			setFieldErrors([]);
			setStep(3);
			return;
		}
		// step === 3 -> final submit
		void handleSubmit();
	}

	async function handleSubmit() {
		const result = validateStep3({ companySize });
		if (!result.valid) {
			setFieldErrors(result.fields);
			return;
		}
		if (!metadataReady) {
			// The org row must exist before completeMetadata (org-scoped mutation).
			setFormError("Couldn't create your organization. Try again.");
			return;
		}
		setFieldErrors([]);
		setFormError(null);
		setSubmitting(true);
		try {
			await completeMetadata({
				email,
				phone,
				website: website || undefined,
				addressStreet: address.streetAddress,
				addressCity: address.city,
				addressState: address.state,
				addressZip: address.zipCode,
				addressCountry: address.country,
				latitude: address.latitude,
				longitude: address.longitude,
				companySize,
			});
			// Route via the shared post-auth helper — never hardcode "/(tabs)".
			// router.replace is typed to a Href literal union; the helper deals in
			// plain strings, so adapt with a single cast at the boundary.
			navigateAfterAuth(
				(href) => router.replace(href as Parameters<typeof router.replace>[0]),
				resolveAuthDestination({
					isLoaded: Boolean(authLoaded && isLoaded),
					isSignedIn: Boolean(isSignedIn),
					hasActiveOrg: Boolean(activeOrg),
					membershipCount: userMemberships?.data?.length ?? 0,
					// After completeMetadata, needsMetadata flips to false -> "/(tabs)".
					needsMetadata: needsMetadata === undefined ? false : needsMetadata,
				})
			);
		} catch {
			setFormError("Couldn't create your organization. Try again.");
		} finally {
			setSubmitting(false);
		}
	}

	function handleBack() {
		setFieldErrors([]);
		setFormError(null);
		if (step > 1) setStep((s) => (s - 1) as Step);
	}

	// --- "Setting up your organization…" overlay ----------------------------
	if (settingUp) {
		return (
			<View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
				{timedOut ? (
					<View style={styles.setupBox}>
						<Text style={styles.setupTitle}>Setup is taking longer</Text>
						<Text style={styles.setupBody}>
							{"Setup is taking longer than expected. Try again or contact support."}
						</Text>
						<View style={styles.setupCta}>
							<StyledButton
								intent="primary"
								label="Try again"
								showArrow={false}
								onPress={handleRetry}
							/>
						</View>
					</View>
				) : (
					<View style={styles.setupBox}>
						<Text style={styles.setupTitle}>
							Setting up your organization…
						</Text>
						<Text style={styles.setupBody}>This only takes a moment.</Text>
					</View>
				)}
			</View>
		);
	}

	return (
		<View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
			<ScrollView
				contentContainerStyle={styles.scroll}
				keyboardShouldPersistTaps="handled"
			>
				<Text style={styles.entryTitle}>Let&apos;s set up your business</Text>
				<Text style={styles.entrySubtitle}>
					A few quick details and you&apos;re in.
				</Text>

				<View style={styles.progressRow}>
					{([1, 2, 3] as Step[]).map((seg) => (
						<View
							key={seg}
							style={[
								styles.progressSegment,
								{
									backgroundColor:
										seg <= step ? tokens.accent : tokens.border,
								},
							]}
						/>
					))}
				</View>
				<View style={styles.eyebrowRow}>
					<Eyebrow color={tokens.ink}>{`Step ${step} of 3`}</Eyebrow>
				</View>

				<Text style={styles.stepTitle}>{STEP_TITLES[step]}</Text>

				{step === 1 ? (
					<View style={styles.stepBody}>
						<TextInput
							value={orgName}
							onChangeText={setOrgName}
							placeholder="Business name"
							placeholderTextColor={tokens.faint}
							editable={!submitting}
							style={styles.input}
							autoCapitalize="words"
						/>
					</View>
				) : null}

				{step === 2 ? (
					<View style={styles.stepBody}>
						<AddressAutocomplete value={address} onChange={setAddress} />
						<TextInput
							value={email}
							onChangeText={setEmail}
							placeholder="Email"
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
				) : null}

				{step === 3 ? (
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
											{
												borderColor: selected
													? tokens.accent
													: tokens.border,
											},
										]}
									>
										<Text style={styles.sizeLabel}>{size}</Text>
										{selected ? (
											<Check size={18} color={tokens.accent} />
										) : null}
									</Card>
								</Pressable>
							);
						})}
					</View>
				) : null}

				{fieldErrors.length > 0 ? (
					<Text style={styles.errorText}>This field is required.</Text>
				) : null}
				{formError ? <Text style={styles.errorText}>{formError}</Text> : null}
			</ScrollView>

			<View
				style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}
			>
				{step > 1 ? (
					<View style={styles.footerHalf}>
						<StyledButton
							intent="outline"
							label="Back"
							showArrow={false}
							disabled={submitting}
							onPress={handleBack}
						/>
					</View>
				) : null}
				<View style={styles.footerHalf}>
					<StyledButton
						intent="primary"
						label={step === 3 ? "Create organization" : "Continue"}
						showArrow={false}
						isLoading={submitting}
						onPress={handleAdvance}
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
	scroll: {
		paddingBottom: spacing.xl,
	},
	entryTitle: {
		fontFamily: fontFamily.bold,
		fontSize: type.h1,
		color: tokens.ink,
	},
	entrySubtitle: {
		fontFamily: fontFamily.regular,
		fontSize: type.h4,
		color: tokens.sub,
		marginTop: spacing.xs,
	},
	progressRow: {
		flexDirection: "row",
		gap: spacing.sm,
		marginTop: spacing.xl,
	},
	progressSegment: {
		flex: 1,
		height: 6,
		borderRadius: 3,
	},
	eyebrowRow: {
		marginTop: spacing.sm,
	},
	stepTitle: {
		fontFamily: fontFamily.bold,
		fontSize: type.h1,
		color: tokens.ink,
		marginTop: spacing.xl,
	},
	stepBody: {
		marginTop: spacing.md,
		gap: spacing.md,
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
	footer: {
		flexDirection: "row",
		gap: spacing.md,
		paddingTop: spacing.md,
	},
	footerHalf: {
		flex: 1,
	},
	setupBox: {
		alignItems: "center",
		gap: spacing.sm,
		paddingHorizontal: spacing.lg,
	},
	setupTitle: {
		fontFamily: fontFamily.bold,
		fontSize: type.h2,
		color: tokens.ink,
		textAlign: "center",
	},
	setupBody: {
		fontFamily: fontFamily.regular,
		fontSize: type.h4,
		color: tokens.sub,
		textAlign: "center",
	},
	setupCta: {
		marginTop: spacing.md,
		alignSelf: "stretch",
	},
});
