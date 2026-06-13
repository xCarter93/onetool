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
import { useOrganization, useOrganizationList, useUser } from "@clerk/expo";
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
import { useDevice } from "@/lib/use-device";
import {
	canWriteMetadata,
	isSetupTimedOut,
	shouldRetryOrgCreate,
	validateStep1,
	validateStep2,
	validateStep3,
} from "@/lib/wizardValidation";

type Step = 1 | 2 | 3;
type CompanySize = "1-10" | "10-100" | "100+";

const STEP_TITLES: Record<Step, string> = {
	1: "Your name and business",
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
	const { device } = useDevice();
	const isPad = device === "ipad";

	// --- Auth / org hooks ---------------------------------------------------
	const { user } = useUser();
	const { organization: activeOrg } = useOrganization();
	const { createOrganization, setActive, userMemberships } =
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
	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");
	const [nameSeeded, setNameSeeded] = useState(false);
	const [orgName, setOrgName] = useState("");
	// Step-2
	const [address, setAddress] = useState<AddressValue>(EMPTY_ADDRESS);
	const [email, setEmail] = useState("");
	const [phone, setPhone] = useState("");
	const [website, setWebsite] = useState("");
	// Step-3
	const [companySize, setCompanySize] = useState<CompanySize | undefined>();

	// --- Webhook-race / setup state -----------------------------------------
	// createdOrgRef holds the Clerk org id created this session — but ONLY for the
	// brief tick before setActive() lands: setActive flips the active org, which
	// bumps the root _layout ConvexProvider key and REMOUNTS this screen, resetting
	// all in-memory state (refs included). The durable signal across that remount
	// is the active Clerk org itself, so the org-id gate keys off activeOrg first.
	const createdOrgRef = useRef<string | null>(null);
	const creatingRef = useRef(false); // in-flight guard against duplicate creates
	const [settingUp, setSettingUp] = useState(false);
	const [setupStartedAt, setSetupStartedAt] = useState<number | null>(null);
	const [timedOut, setTimedOut] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	// Set after completeMetadata commits; navigation is deferred until the
	// reactive needsMetadata query confirms false (see effect below).
	const [finishing, setFinishing] = useState(false);

	// The reactive Convex row flips to the matching org once createFromClerk
	// inserts it — org-id MATCH, not mere non-null (canWriteMetadata). Keyed off
	// the durable active org id (createdOrgRef is reset by the remount and is only
	// read inside handlers, never during render).
	const metadataReady = canWriteMetadata(convexOrg, activeOrg?.id ?? null);

	// Seed the name inputs once from Clerk (Google / email sign-ups arrive with a
	// name; Apple returning-auth sign-ups do not). Render-time derivation, guarded
	// by a flag — the apps/mobile lint forbids setState in an effect.
	if (!nameSeeded && user) {
		setNameSeeded(true);
		if (user.firstName) setFirstName(user.firstName);
		if (user.lastName) setLastName(user.lastName);
	}

	// Once an active org exists, the create step is done. setActive() remounts this
	// screen with step reset to 1; re-derive from the durable active org so we
	// resume at step 2 instead of restarting step 1 — restarting created a fresh
	// duplicate org on every Continue. Also clears the setup overlay (no-op after
	// a remount, since fresh state already has settingUp=false).
	if (activeOrg && step === 1) {
		setStep(2);
		setSettingUp(false);
		setTimedOut(false);
		setSetupStartedAt(null);
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

	// Post-completeMetadata navigation: wait for the reactive needsMetadata query
	// to confirm false before routing to the app, so neither this navigation nor
	// the (tabs) layout reads the stale `true` and bounces back into the wizard.
	useEffect(() => {
		if (finishing && needsMetadata === false) {
			router.replace("/(tabs)" as Parameters<typeof router.replace>[0]);
		}
	}, [finishing, needsMetadata, router]);

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
				// In-flight guard around the create itself: setActive remounts this
				// screen, so a second tap before that lands must NOT fire a second
				// createOrganization (the duplicate-org bug). Reset only on failure;
				// on success the remount discards this instance's ref entirely.
				if (creatingRef.current) return;
				creatingRef.current = true;
				if (!createOrganization || !setActive) {
					throw new Error("Clerk is not ready");
				}
				const org = await createOrganization({ name: orgName.trim() });
				createdOrgRef.current = org.id;
				// setActive remounts this screen (root ConvexProvider key bump). The
				// remounted instance resumes at step 2 via the activeOrg sentinel; any
				// state set after this line may be discarded by the remount.
				await setActive({ organization: org.id });
			}

			setSettingUp(true);
			setSetupStartedAt(Date.now());
		} catch {
			creatingRef.current = false;
			setSettingUp(false);
			setFormError("Couldn't create your organization. Try again.");
		}
	}

	async function handleStep1Continue() {
		// Org already active (e.g. tapped during the post-create remount): advance,
		// never create a duplicate.
		if (activeOrg) {
			setStep(2);
			return;
		}
		const result = validateStep1({ firstName, lastName, orgName });
		if (!result.valid) {
			setFieldErrors(result.fields);
			return;
		}
		setFieldErrors([]);

		// Persist the name to Clerk BEFORE org creation: setActive() in runOrgCreate
		// remounts this screen and wipes step-1 state, so the name must live in Clerk
		// (which re-syncs to convex users.name via the user.updated webhook) to
		// survive. Skip the write when nothing changed.
		const fName = firstName.trim();
		const lName = lastName.trim();
		if (user && (user.firstName !== fName || user.lastName !== lName)) {
			try {
				await user.update({ firstName: fName, lastName: lName });
			} catch {
				setFormError("Couldn't save your name. Try again.");
				return;
			}
		}

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
			void handleStep1Continue();
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
			// Do NOT navigate yet. needsMetadata is a reactive query that is still
			// `true` this tick (the subscription hasn't observed the just-committed
			// mutation). Navigating now — anywhere — bounces back into the wizard:
			// both resolveAuthDestination and the (tabs) layout read the stale `true`
			// and route to the wizard. Flip `finishing` and let the effect navigate
			// once needsMetadata reactively confirms `false`. Keep `submitting` true
			// so the button stays in its loading state through the brief wait.
			setFinishing(true);
		} catch {
			setFormError("Couldn't create your organization. Try again.");
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
				contentContainerStyle={[
					styles.scroll,
					// iPad: ~480pt centered card column over the brand wash.
					isPad && styles.cardPad,
				]}
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
							value={firstName}
							onChangeText={setFirstName}
							placeholder="First name"
							placeholderTextColor={tokens.faint}
							editable={!submitting}
							style={styles.input}
							autoCapitalize="words"
							textContentType="givenName"
						/>
						<TextInput
							value={lastName}
							onChangeText={setLastName}
							placeholder="Last name"
							placeholderTextColor={tokens.faint}
							editable={!submitting}
							style={styles.input}
							autoCapitalize="words"
							textContentType="familyName"
						/>
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
				style={[
					styles.footer,
					isPad && styles.footerPad,
					{ paddingBottom: insets.bottom + spacing.md },
				]}
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
	// iPad: ~480pt centered card column (wizard step content).
	cardPad: {
		width: "100%",
		maxWidth: 480,
		alignSelf: "center",
	},
	// iPad: keep the footer buttons aligned under the centered card.
	footerPad: {
		width: "100%",
		maxWidth: 480,
		alignSelf: "center",
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
