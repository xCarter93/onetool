"use client";

import React, { useMemo, useState, useEffect, useSyncExternalStore } from "react";
import { useUser, useOrganization, useOrganizationList } from "@clerk/nextjs";
import { PricingTable } from "@clerk/nextjs";
import { useTheme } from "next-themes";
import { useMutation, useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Frame, FramePanel } from "@/components/reui/frame";
import SelectService from "@/components/shared/choice-set";
import { Input } from "@/components/ui/input";
import {
	AddressAutocomplete,
	type AddressData,
} from "@/components/ui/address-autocomplete";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAutoTimezone } from "@/hooks/use-auto-timezone";
import { useFeatureAccess } from "@/hooks/use-feature-access";
import { Users, Building2, Globe, Upload, Check, Loader2 } from "lucide-react";
import { api } from "@onetool/backend/convex/_generated/api";
import { ImportWizard } from "@/app/(workspace)/clients/import/components/import-wizard";
import { OnboardingPageBackground } from "@/components/blocks/onboarding-2/components/onboarding-background";
import { OnboardingHeader } from "@/components/blocks/onboarding-2/components/onboarding-header";
import { OnboardingStepper } from "@/components/blocks/onboarding-2/components/onboarding-stepper";
import type { OnboardingStep } from "@/components/blocks/onboarding-2/components/data";
import Image from "next/image";

const ONBOARDING_STEPS: OnboardingStep[] = [
	{
		id: "create",
		value: 1,
		label: "Organization",
		title: "Create your organization",
		description: "Set up your organization to get started with OneTool.",
	},
	{
		id: "business",
		value: 2,
		label: "Business info",
		title: "Business information",
		description: "Tell us more about your business to customize your experience.",
	},
	{
		id: "size",
		value: 3,
		label: "Company size",
		title: "How big is your team?",
		description: "Help us understand your team size to provide the best experience.",
	},
	{
		id: "plan",
		value: 4,
		label: "Plan",
		title: "Choose your plan",
		description:
			"Select the plan that best fits your business needs. You can upgrade or downgrade anytime.",
	},
	{
		id: "import",
		value: 5,
		label: "Import data",
		title: "Import your data",
		description: "Import existing clients from a CSV, or finish setup and add them later.",
		optional: true,
	},
];

const TOTAL_STEPS = ONBOARDING_STEPS.length;

// Inner content column per step; the card itself is one fixed generous size.
const STEP_WIDTHS: Record<number, string> = {
	1: "max-w-xl",
	2: "max-w-xl",
	3: "max-w-2xl",
	4: "max-w-5xl",
	5: "max-w-2xl",
};

function StepHeading({
	title,
	description,
}: {
	title: string;
	description: string;
}) {
	return (
		<div className="flex max-w-md flex-col gap-1.5" aria-live="polite">
			<h1 className="text-foreground text-xl leading-7 font-semibold text-balance sm:text-[1.375rem]">
				{title}
			</h1>
			<p className="text-muted-foreground text-sm leading-5 text-pretty">
				{description}
			</p>
		</div>
	);
}

interface FormData {
	email: string;
	website: string;
	phone: string;
	addressStreet: string;
	addressCity: string;
	addressState: string;
	addressZip: string;
	addressCountry: string;
	latitude: number | null;
	longitude: number | null;
	companySize: string;
	logoInvertInDarkMode: boolean;
}

export function CompleteOrganizationMetadata() {
	const { user, isLoaded: userLoaded } = useUser();
	const { organization: clerkOrganization, isLoaded: clerkOrgLoaded } =
		useOrganization();
	const { resolvedTheme } = useTheme();
	const router = useRouter();
	const searchParams = useSearchParams();
	const completeMetadata = useMutation(api.organizations.completeMetadata);
	const organization = useQuery(api.organizations.get);
	const needsCompletion = useQuery(api.organizations.needsMetadataCompletion);
	const toast = useToast();
	const shouldReduceMotion = useReducedMotion();

	// Check if user has premium access for import feature
	const { hasPremiumAccess } = useFeatureAccess();

	// Automatically detect and save timezone if not set
	useAutoTimezone();

	const [currentStep, setCurrentStep] = useState(1);
	const [transitionDirection, setTransitionDirection] = useState<1 | -1>(1);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	// True only after client hydration; avoids theme hydration mismatch
	const mounted = useSyncExternalStore(
		() => () => {},
		() => true,
		() => false
	);
	const [hasCreatedOrg, setHasCreatedOrg] = useState(false);

	// Import wizard state machine: collapsed -> expanded -> completed
	type ImportSectionState = "collapsed" | "expanded" | "completed";
	const [importState, setImportState] =
		useState<ImportSectionState>("collapsed");
	const [importSummary, setImportSummary] = useState<{
		count: number;
	} | null>(null);

	// Step 1: custom create-org form state (replaces Clerk's <CreateOrganization>)
	const {
		isLoaded: orgListLoaded,
		createOrganization,
		setActive,
	} = useOrganizationList();
	const [orgName, setOrgName] = useState("");
	// First/last name are required HERE, not at the Clerk sign-up step: the Clerk
	// instance keeps name optional so Sign in with Apple completes on returning
	// auth (Apple returns the name only on first authorization). Captured here and
	// written to Clerk before org creation. Mirrors the mobile onboarding wizard.
	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");
	const [createFirstNameError, setCreateFirstNameError] = useState<
		string | null
	>(null);
	const [createLastNameError, setCreateLastNameError] = useState<string | null>(
		null
	);
	const [nameSeeded, setNameSeeded] = useState(false);
	const [logoFile, setLogoFile] = useState<File | null>(null);
	const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
	const [createSubmitting, setCreateSubmitting] = useState(false);
	const [createNameError, setCreateNameError] = useState<string | null>(null);
	const [createLogoError, setCreateLogoError] = useState<string | null>(null);

	// Holds the org created on a prior attempt so retries (after setLogo/setActive
	// fail) reuse it instead of creating a duplicate. Invalidated when the name
	// changes, since a new name means a new org.
	const createdOrgRef = React.useRef<{
		org: Awaited<ReturnType<NonNullable<typeof createOrganization>>>;
		name: string;
	} | null>(null);

	const [formData, setFormData] = useState<FormData>({
		email: user?.primaryEmailAddress?.emailAddress || "",
		website: "",
		phone: "",
		addressStreet: "",
		addressCity: "",
		addressState: "",
		addressZip: "",
		addressCountry: "United States",
		latitude: null,
		longitude: null,
		companySize: "",
		logoInvertInDarkMode: true,
	});

	// Seed the name inputs once from Clerk (Google / email sign-ups arrive with a
	// name; Apple returning-auth sign-ups do not). Render-time derivation, guarded
	// by a flag — the eslint config forbids setState inside an effect.
	if (!nameSeeded && user) {
		setNameSeeded(true);
		// Only fill empty fields — never clobber input typed before Clerk hydrated.
		if (user.firstName && !firstName) setFirstName(user.firstName);
		if (user.lastName && !lastName) setLastName(user.lastName);
		const clerkEmail = user.primaryEmailAddress?.emailAddress;
		if (clerkEmail && !formData.email) {
			setFormData((prev) => (prev.email ? prev : { ...prev, email: clerkEmail }));
		}
	}

	// Whether we're creating a new organization (from query param)
	const isCreatingNew = searchParams.get("creating") === "true";

	// Redirect if metadata is already complete
	// Only redirect when organization exists in Convex AND metadata is marked complete
	React.useEffect(() => {
		// Don't redirect if we're in the process of creating a new organization
		if (isCreatingNew) {
			return;
		}

		// Don't redirect if we're still loading data
		if (needsCompletion === undefined || organization === undefined) {
			return;
		}

		// Don't redirect if no Convex org exists yet (webhook still processing)
		if (!organization) {
			return;
		}

		// Only redirect if metadata is actually complete
		if (needsCompletion === false && clerkOrganization) {
			// If needsCompletion is false and we have organization data,
			// it means the metadata is already complete
			router.push("/home");
		}
	}, [needsCompletion, organization, clerkOrganization, router, isCreatingNew]);

	// In "creating new" mode, snapshot the org id once Clerk has loaded so we can
	// detect when a brand-new org gets created (id changes). Capturing before Clerk
	// loads would record null and the step would never advance.
	const [initialOrgId, setInitialOrgId] = useState<string | null>(null);
	const [initialOrgCaptured, setInitialOrgCaptured] = useState(false);
	if (isCreatingNew && clerkOrgLoaded && !initialOrgCaptured) {
		setInitialOrgCaptured(true);
		setInitialOrgId(clerkOrganization?.id ?? null);
	}

	// Skip step 1 once an organization exists. Run during render when the org
	// identity changes rather than in an effect.
	const [prevOrgId, setPrevOrgId] = useState<string | null>(null);
	const currentOrgId = clerkOrganization?.id ?? null;
	if (currentOrgId !== prevOrgId) {
		setPrevOrgId(currentOrgId);
		if (clerkOrganization && !hasCreatedOrg) {
			if (isCreatingNew) {
				// Advance once captured and the id changed — covers first org (null → id)
				if (initialOrgCaptured && currentOrgId !== initialOrgId) {
					setHasCreatedOrg(true);
					if (currentStep === 1) {
						setCurrentStep(2);
					}
				}
			} else {
				// Normal flow: user already has an org, skip step 1
				setHasCreatedOrg(true);
				if (currentStep === 1) {
					setCurrentStep(2);
				}
			}
		}
	}

	const currentTheme = mounted ? resolvedTheme : "light";
	const isDark = currentTheme === "dark";

	const currentStepMeta = ONBOARDING_STEPS[currentStep - 1];
	// Step 1 is locked once the org exists in Clerk — there is nothing to go back to.
	const minStep = hasCreatedOrg ? 2 : 1;

	const companySizeOptions = [
		{
			icon: Users,
			text: "1-10",
			value: "1-10",
		},
		{
			icon: Building2,
			text: "10-100",
			value: "10-100",
		},
		{
			icon: Globe,
			text: "100+",
			value: "100+",
		},
	];

	const isStep2Complete = () => {
		const requiredFields = [
			formData.email.trim(),
			formData.phone.trim(),
			formData.addressStreet.trim(),
			formData.addressCity.trim(),
			formData.addressState.trim(),
			formData.addressZip.trim(),
		];
		return requiredFields.every(Boolean);
	};

	const goToStep = (step: number) => {
		const nextStep = Math.min(Math.max(step, minStep), TOTAL_STEPS);
		setTransitionDirection(nextStep >= currentStep ? 1 : -1);
		setCurrentStep(nextStep);
	};

	const handleNext = () => {
		setError(null);
		if (currentStep === 2 && !isStep2Complete()) {
			toast.warning(
				"Missing Required Information",
				"Please complete business email, phone number, and full address to continue."
			);
			return;
		}

		if (currentStep < TOTAL_STEPS) {
			goToStep(currentStep + 1);
		}
	};

	const handlePrevious = () => {
		setError(null);
		if (currentStep > minStep) {
			goToStep(currentStep - 1);
		}
	};

	// Stepper triggers only navigate backwards; forward movement goes through Continue.
	const handleStepNavigation = (step: number) => {
		if (step >= currentStep) return;
		setError(null);
		goToStep(step);
	};

	const normalizedWebsite = useMemo(() => {
		if (!formData.website.trim()) {
			return "";
		}
		const trimmed = formData.website.trim();
		return trimmed.replace(/^https?:\/\//i, "");
	}, [formData.website]);

	const invertPreviewStyles = formData.logoInvertInDarkMode
		? "invert brightness-0"
		: "";

	const handleCompleteSetup = async () => {
		// Navigate only once metadata is actually persisted.
		const saved = await handleCompleteMetadata();
		if (!saved) return;

		router.push("/home");
	};

	const handleCompleteMetadata = async (): Promise<boolean> => {
		setError(null);

		// Basic validation
		if (!isStep2Complete()) {
			toast.warning(
				"Missing Required Information",
				"Please complete business email, phone number, and full address to finish setup."
			);
			return false;
		}

		if (!formData.companySize) {
			setError("Please select a company size before completing setup.");
			return false;
		}

		setIsLoading(true);

		try {
			await completeMetadata({
				email: formData.email.trim() || undefined,
				website: normalizedWebsite ? `https://${normalizedWebsite}` : undefined,
				phone: formData.phone.trim() || undefined,
				// Structured address fields
				addressStreet: formData.addressStreet.trim() || undefined,
				addressCity: formData.addressCity.trim() || undefined,
				addressState: formData.addressState.trim() || undefined,
				addressZip: formData.addressZip.trim() || undefined,
				addressCountry: formData.addressCountry.trim() || undefined,
				// Geocoding (from Mapbox Address Autofill)
				latitude: formData.latitude ?? undefined,
				longitude: formData.longitude ?? undefined,
				companySize: formData.companySize as "1-10" | "10-100" | "100+",
				logoUrl: clerkOrganization?.imageUrl || undefined,
				logoInvertInDarkMode: formData.logoInvertInDarkMode,
			});

			// Don't redirect here - let handleCompleteSetup do it
			return true;
		} catch (err) {
			console.error("Failed to complete organization metadata:", err);
			setError(
				err instanceof Error
					? err.message
					: "Failed to save organization settings. Please try again."
			);
			return false;
		} finally {
			setIsLoading(false);
		}
	};

	// Revoke any object URL created for the logo preview to avoid blob retention.
	useEffect(() => {
		return () => {
			if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
		};
	}, [logoPreviewUrl]);

	const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
		setCreateLogoError(null);
		const file = e.target.files?.[0] ?? null;
		if (!file) return;
		if (file.size > 10 * 1024 * 1024) {
			setCreateLogoError("Logo must be 10 MB or smaller");
			// Reset so re-selecting the same file refires onChange
			e.target.value = "";
			return;
		}
		// Old URL is revoked by the useEffect cleanup when logoPreviewUrl changes.
		setLogoFile(file);
		setLogoPreviewUrl(URL.createObjectURL(file));
	};

	const handleCreateOrganization: React.FormEventHandler<
		HTMLFormElement
	> = async (e) => {
		e.preventDefault();
		setCreateNameError(null);
		setCreateFirstNameError(null);
		setCreateLastNameError(null);

		const trimmedFirst = firstName.trim();
		const trimmedLast = lastName.trim();
		const trimmedName = orgName.trim();
		let hasError = false;
		if (!trimmedFirst) {
			setCreateFirstNameError("First name is required");
			hasError = true;
		}
		if (!trimmedLast) {
			setCreateLastNameError("Last name is required");
			hasError = true;
		}
		if (!trimmedName) {
			setCreateNameError("Organization name is required");
			hasError = true;
		}
		if (hasError) return;
		// Guard: hooks still initializing. userLoaded gates the name write below —
		// without it, user is null and the name is never persisted before org create.
		if (!orgListLoaded || !createOrganization || !userLoaded) return;

		setCreateSubmitting(true);
		try {
			// Persist the user's name to Clerk before org creation (re-syncs to
			// convex users.name via the user.updated webhook). Skip when unchanged.
			// Own try/catch so a name-write failure reports accurately instead of the
			// org-creation error below.
			if (
				user &&
				(user.firstName !== trimmedFirst || user.lastName !== trimmedLast)
			) {
				try {
					await user.update({
						firstName: trimmedFirst,
						lastName: trimmedLast,
					});
				} catch {
					toast.warning("Couldn't save your name", "Please try again.");
					return;
				}
			}

			// 1. Create org — or reuse one from a prior failed attempt with the same
			// name to avoid orphaning + duplicating on retry.
			const cached = createdOrgRef.current;
			const newOrg =
				cached && cached.name === trimmedName
					? cached.org
					: await createOrganization({ name: trimmedName });
			createdOrgRef.current = { org: newOrg, name: trimmedName };

			// 2. Upload logo BEFORE setActive so step 2's preview tiles see imageUrl on first render
			if (logoFile) {
				await newOrg.setLogo({ file: logoFile });
			}

			// 3. Mark as active session org
			await setActive({ organization: newOrg.id });

			// 4. Advance wizard in-place — no router.push, no router.refresh, no reload
			createdOrgRef.current = null;
			setTransitionDirection(1);
			setCurrentStep(2);
		} catch (err) {
			const message =
				(err as { errors?: Array<{ message: string }> })?.errors?.[0]
					?.message ??
				(err instanceof Error ? err.message : "Failed to create organization");
			toast.warning("Couldn't create organization", message);
		} finally {
			setCreateSubmitting(false);
		}
	};

	const renderStep1 = () => (
		<>
			{!orgListLoaded ? (
				<div className="flex items-center justify-center py-12">
					<div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
				</div>
			) : (
				<div className="space-y-6">
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div>
							<label
								htmlFor="first-name"
								className="block text-sm font-medium text-foreground mb-2"
							>
								First Name
							</label>
							<Input
								id="first-name"
								value={firstName}
								onChange={(e) => {
									setFirstName(e.target.value);
									if (createFirstNameError) setCreateFirstNameError(null);
								}}
								disabled={createSubmitting}
								placeholder="Jane"
								autoComplete="given-name"
								aria-invalid={createFirstNameError ? true : undefined}
								aria-describedby={
									createFirstNameError ? "first-name-error" : undefined
								}
								className="w-full bg-background"
							/>
							{createFirstNameError && (
								<p
									id="first-name-error"
									className="mt-2 text-sm text-destructive"
								>
									{createFirstNameError}
								</p>
							)}
						</div>
						<div>
							<label
								htmlFor="last-name"
								className="block text-sm font-medium text-foreground mb-2"
							>
								Last Name
							</label>
							<Input
								id="last-name"
								value={lastName}
								onChange={(e) => {
									setLastName(e.target.value);
									if (createLastNameError) setCreateLastNameError(null);
								}}
								disabled={createSubmitting}
								placeholder="Doe"
								autoComplete="family-name"
								aria-invalid={createLastNameError ? true : undefined}
								aria-describedby={
									createLastNameError ? "last-name-error" : undefined
								}
								className="w-full bg-background"
							/>
							{createLastNameError && (
								<p
									id="last-name-error"
									className="mt-2 text-sm text-destructive"
								>
									{createLastNameError}
								</p>
							)}
						</div>
					</div>

					<div>
						<label
							htmlFor="org-name"
							className="block text-sm font-medium text-foreground mb-2"
						>
							Organization Name
						</label>
						<Input
							id="org-name"
							value={orgName}
							onChange={(e) => {
								setOrgName(e.target.value);
								if (createNameError) setCreateNameError(null);
							}}
							disabled={createSubmitting}
							placeholder="Acme Cleaning Co."
							autoComplete="organization"
							aria-invalid={createNameError ? true : undefined}
							aria-describedby={createNameError ? "org-name-error" : undefined}
							className="w-full bg-background"
						/>
						{createNameError && (
							<p id="org-name-error" className="mt-2 text-sm text-destructive">
								{createNameError}
							</p>
						)}
					</div>

					<div>
						<label
							htmlFor="org-logo"
							className="block text-sm font-medium text-foreground mb-2"
						>
							Organization Logo{" "}
							<span className="text-muted-foreground font-normal">
								(optional)
							</span>
						</label>
						<div className="flex items-center gap-4">
							{logoPreviewUrl ? (
								<Image
									src={logoPreviewUrl}
									alt="Logo preview"
									width={64}
									height={64}
									className="h-16 w-16 rounded-lg border border-border object-contain bg-white"
									unoptimized
								/>
							) : (
								<div className="h-16 w-16 rounded-lg border border-dashed border-border flex items-center justify-center bg-muted/20">
									<Upload className="h-5 w-5 text-muted-foreground" />
								</div>
							)}
							<input
								id="org-logo"
								type="file"
								accept="image/*"
								onChange={handleLogoSelect}
								disabled={createSubmitting}
								className="text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/20 file:cursor-pointer"
							/>
						</div>
						{createLogoError && (
							<p className="mt-2 text-sm text-destructive">{createLogoError}</p>
						)}
						<p className="mt-2 text-xs text-muted-foreground">
							PNG, JPG, or SVG up to 10 MB.
						</p>
					</div>
				</div>
			)}
		</>
	);

	const renderStep2 = () => (
		<div className="space-y-6">
			<div>
				<label
					htmlFor="business-email"
					className="block text-sm font-medium text-foreground mb-2"
				>
					Business Email
				</label>
				<Input
					id="business-email"
					value={formData.email}
					onChange={(e) => setFormData({ ...formData, email: e.target.value })}
					className="w-full bg-background"
					placeholder="your.business@company.com"
					type="email"
				/>
			</div>

			<div>
				<label
					htmlFor="business-website"
					className="block text-sm font-medium text-foreground mb-2"
				>
					Company Website
				</label>
				<div className="flex">
					<span className="flex shrink-0 items-center rounded-l-md border border-border bg-muted/40 px-3 text-sm font-medium text-muted-foreground">
						https://
					</span>
					<Input
						id="business-website"
						value={formData.website}
						onChange={(e) =>
							setFormData({
								...formData,
								website: e.target.value.replace(/^https?:\/\//i, ""),
							})
						}
						className="w-full rounded-l-none border-l-0 bg-background"
						placeholder="www.yourcompany.com"
						type="text"
					/>
				</div>
			</div>

			<div>
				<label
					htmlFor="business-phone"
					className="block text-sm font-medium text-foreground mb-2"
				>
					Phone Number
				</label>
				<Input
					id="business-phone"
					value={formData.phone}
					onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
					className="w-full bg-background"
					placeholder="+1 (555) 123-4567"
					type="tel"
				/>
			</div>

			<div>
				<label
					htmlFor="business-address-street"
					className="block text-sm font-medium text-foreground mb-2"
				>
					Business Address
				</label>
				<div className="grid gap-4 sm:grid-cols-2">
					<div className="sm:col-span-2">
						{/* Functional updates: Mapbox fires the input's change event right
						    after onRetrieve; a stale spread would wipe city/state/zip. */}
						<AddressAutocomplete
							id="business-address-street"
							value={formData.addressStreet}
							onChange={(value) =>
								setFormData((prev) => ({ ...prev, addressStreet: value }))
							}
							onAddressSelect={(address: AddressData) => {
								setFormData((prev) => ({
									...prev,
									addressStreet: address.streetAddress,
									addressCity: address.city,
									addressState: address.state,
									addressZip: address.zipCode,
									addressCountry: address.country,
									latitude: address.latitude,
									longitude: address.longitude,
								}));
							}}
							className="w-full bg-background"
							placeholder="Start typing your business address..."
						/>
					</div>
					<div>
						<Input
							aria-label="City"
							value={formData.addressCity}
							onChange={(e) =>
								setFormData({ ...formData, addressCity: e.target.value })
							}
							className="w-full bg-background"
							placeholder="City"
						/>
					</div>
					<div className="grid grid-cols-2 gap-4">
						<Input
							aria-label="State"
							value={formData.addressState}
							onChange={(e) =>
								setFormData({ ...formData, addressState: e.target.value })
							}
							className="w-full bg-background"
							placeholder="State"
						/>
						<Input
							aria-label="ZIP code"
							value={formData.addressZip}
							onChange={(e) =>
								setFormData({ ...formData, addressZip: e.target.value })
							}
							className="w-full bg-background"
							placeholder="ZIP"
						/>
					</div>
				</div>
			</div>

			<div>
				<label className="block text-sm font-medium text-foreground mb-2">
					Logo Display Preferences
				</label>
				<div className="space-y-4 border border-border rounded-xl p-5">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<p className="text-sm font-medium text-foreground">
								Invert logo colors in dark mode
							</p>
							<p className="text-xs text-muted-foreground">
								Enable this if your logo is dark so it stays visible on dark
								backgrounds.
							</p>
						</div>
						<div className="flex items-center gap-3">
							<Checkbox
								checked={formData.logoInvertInDarkMode}
								onCheckedChange={(checked) =>
									setFormData({
										...formData,
										logoInvertInDarkMode: Boolean(checked),
									})
								}
								className="size-5"
							/>
							<span className="text-sm text-muted-foreground">
								{formData.logoInvertInDarkMode ? "Enabled" : "Disabled"}
							</span>
						</div>
					</div>

					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div className="border border-border/60 rounded-lg p-4 flex flex-col items-center gap-3 bg-white">
							<span className="text-xs uppercase tracking-wide text-muted-foreground">
								Light Mode Preview
							</span>
							<div className="h-16 w-16 rounded-lg border border-border flex items-center justify-center bg-white">
								{clerkOrganization?.imageUrl ? (
									<Image
										src={clerkOrganization.imageUrl}
										alt="Logo preview light"
										width={64}
										height={64}
										className="max-h-12 max-w-full object-contain"
									/>
								) : (
									<span className="text-xs text-muted-foreground">No logo</span>
								)}
							</div>
						</div>
						<div className="border border-border/60 dark:border-border/40 rounded-lg p-4 flex flex-col items-center gap-3 bg-zinc-900">
							<span className="text-xs uppercase tracking-wide text-muted-foreground">
								Dark Mode Preview
							</span>
							<div className="h-16 w-16 rounded-lg border border-border/40 flex items-center justify-center bg-zinc-900">
								{clerkOrganization?.imageUrl ? (
									<Image
										src={clerkOrganization.imageUrl}
										alt="Logo preview dark"
										width={64}
										height={64}
										className={`max-h-12 max-w-full object-contain transition-all duration-200 ${invertPreviewStyles}`}
									/>
								) : (
									<span className="text-xs text-muted-foreground">No logo</span>
								)}
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);

	const renderStep3 = () => (
		<div>
			<label className="block text-sm font-medium text-foreground mb-6">
				How many people work at your company? *
			</label>
			<SelectService
				options={companySizeOptions}
				selected={formData.companySize}
				onChange={(value) => setFormData({ ...formData, companySize: value })}
			/>
		</div>
	);

	const renderStep4 = () => (
		<PricingTable
			for="organization"
			newSubscriptionRedirectUrl="/organization/complete"
			fallback={
				<div className="flex items-center justify-center py-12">
					<div className="text-center">
						<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
						<p className="text-muted-foreground">Loading plans...</p>
					</div>
				</div>
			}
			appearance={{
				elements: {
					// Root container
					rootBox: {
						backgroundColor: "transparent",
						border: "none",
					},
					// Card styling
					card: {
						backgroundColor: isDark
							? "oklch(0.21 0.006 285.885)"
							: "oklch(1 0 0)",
						border: `1px solid ${
							isDark
								? "oklch(0.27 0.013 285.805)"
								: "oklch(0.911 0.006 286.286)"
						}`,
						borderRadius: "var(--radius-lg)",
						boxShadow: isDark
							? "0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -1px rgb(0 0 0 / 0.2)"
							: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -1px rgb(0 0 0 / 0.06)",
					},
					cardBox: {
						padding: "1.5rem",
					},
					// Popular badge
					badge: {
						backgroundColor: "rgb(0, 166, 244)",
						color: "white",
						borderRadius: "9999px",
						padding: "0.25rem 0.75rem",
						fontSize: "0.875rem",
						fontWeight: "500",
					},
					// Plan name
					planName: {
						color: isDark ? "oklch(0.985 0 0)" : "oklch(0.141 0.005 285.823)",
						fontSize: "1.875rem",
						fontWeight: "600",
						marginBottom: "0.5rem",
					},
					// Plan description
					planDescription: {
						color: isDark
							? "oklch(0.705 0.015 286.067)"
							: "oklch(0.552 0.016 285.938)",
						fontSize: "0.875rem",
						lineHeight: "1.25rem",
						marginBottom: "1rem",
					},
					// Price
					planPrice: {
						color: isDark ? "oklch(0.985 0 0)" : "oklch(0.141 0.005 285.823)",
						fontSize: "2.25rem",
						fontWeight: "600",
						display: "flex",
						alignItems: "baseline",
					},
					planPriceCurrency: {
						fontSize: "2.25rem",
					},
					planPriceText: {
						fontSize: "2.25rem",
					},
					planPricePeriod: {
						color: isDark
							? "oklch(0.705 0.015 286.067)"
							: "oklch(0.552 0.016 285.938)",
						fontSize: "1rem",
						marginLeft: "0.25rem",
					},
					// CTA Button
					buttonPrimary: {
						backgroundColor: "rgb(0, 166, 244)",
						color: "white",
						borderRadius: "var(--radius-md)",
						padding: "0.625rem 3rem",
						fontSize: "1rem",
						fontWeight: "500",
						transition: "all 0.2s",
						border: "none",
						"&:hover": {
							opacity: "0.9",
							transform: "translateY(-1px)",
						},
						"&:focus": {
							outline: "2px solid rgb(0, 166, 244)",
							outlineOffset: "2px",
						},
					},
					buttonSecondary: {
						backgroundColor: isDark
							? "oklch(0.244 0.006 286.033)"
							: "oklch(0.92 0.004 286.32)",
						color: isDark ? "oklch(0.985 0 0)" : "oklch(0.141 0.005 285.823)",
						border: `1px solid ${
							isDark
								? "oklch(0.27 0.013 285.805)"
								: "oklch(0.911 0.006 286.286)"
						}`,
						borderRadius: "var(--radius-md)",
						padding: "0.625rem 3rem",
						fontSize: "1rem",
						fontWeight: "500",
						transition: "all 0.2s",
						"&:hover": {
							backgroundColor: isDark
								? "oklch(0.274 0.006 286.033)"
								: "oklch(0.92 0.004 286.32)",
						},
						"&:focus": {
							outline: "2px solid rgb(0, 166, 244)",
							outlineOffset: "2px",
						},
					},
					// Features list
					featureList: {
						marginTop: "1.5rem",
						display: "flex",
						flexDirection: "column",
						gap: "0.5rem",
					},
					featureListItem: {
						color: isDark
							? "oklch(0.705 0.015 286.067)"
							: "oklch(0.552 0.016 285.938)",
						fontSize: "0.875rem",
						display: "flex",
						alignItems: "center",
						gap: "0.75rem",
					},
					featureListItemIcon: {
						color: "rgb(0, 166, 244)",
						width: "1.25rem",
						height: "1.25rem",
						flexShrink: "0",
					},
					// Billing period toggle
					switchContainer: {
						display: "flex",
						justifyContent: "center",
						marginBottom: "2rem",
					},
					switchButton: {
						backgroundColor: isDark
							? "oklch(0.21 0.006 285.885)"
							: "oklch(0.967 0.001 286.375)",
						color: isDark
							? "oklch(0.705 0.015 286.067)"
							: "oklch(0.552 0.016 285.938)",
						borderRadius: "9999px",
						padding: "0.25rem",
						border: `1px solid ${
							isDark
								? "oklch(0.27 0.013 285.805)"
								: "oklch(0.911 0.006 286.286)"
						}`,
					},
					switchButtonActive: {
						backgroundColor: "rgb(0, 166, 244)",
						color: "white",
						boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.1)",
					},
				},
				variables: {
					colorPrimary: "rgb(0, 166, 244)",
					colorText: isDark ? "oklch(0.985 0 0)" : "oklch(0.141 0.005 285.823)",
					colorTextSecondary: isDark
						? "oklch(0.705 0.015 286.067)"
						: "oklch(0.552 0.016 285.938)",
					colorBackground: isDark
						? "oklch(0.091 0.005 285.823)"
						: "oklch(1 0 0)",
					colorInputBackground: isDark
						? "oklch(0.32 0.013 285.805)"
						: "oklch(0.871 0.006 286.286)",
					colorInputText: isDark
						? "oklch(0.985 0 0)"
						: "oklch(0.141 0.005 285.823)",
					borderRadius: "0.5rem",
					fontFamily: "var(--font-geist-sans)",
					fontSize: "1rem",
				},
			}}
			checkoutProps={{
				appearance: {
					elements: {
						// Make checkout modal completely opaque
						modalBackdrop: {
							backgroundColor: isDark
								? "rgba(0, 0, 0, 0.9)"
								: "rgba(0, 0, 0, 0.7)",
							backdropFilter: "blur(8px)",
						},
						modalContent: {
							backgroundColor: isDark
								? "oklch(0.21 0.006 285.885)"
								: "oklch(1 0 0)",
							opacity: "1",
						},
						card: {
							backgroundColor: isDark
								? "oklch(0.21 0.006 285.885)"
								: "oklch(1 0 0)",
							border: `1px solid ${
								isDark
									? "oklch(0.27 0.013 285.805)"
									: "oklch(0.911 0.006 286.286)"
							}`,
							borderRadius: "var(--radius-lg)",
							opacity: "1",
						},
						rootBox: {
							backgroundColor: isDark
								? "oklch(0.21 0.006 285.885)"
								: "oklch(1 0 0)",
							opacity: "1",
						},
						formButtonPrimary: {
							backgroundColor: "rgb(0, 166, 244)",
							color: "white",
							borderRadius: "var(--radius-md)",
							fontSize: "1rem",
							fontWeight: "500",
							"&:hover": {
								opacity: "0.9",
							},
						},
						headerTitle: {
							color: isDark
								? "oklch(0.985 0 0)"
								: "oklch(0.141 0.005 285.823)",
							fontSize: "1.5rem",
							fontWeight: "600",
						},
						headerSubtitle: {
							color: isDark
								? "oklch(0.705 0.015 286.067)"
								: "oklch(0.552 0.016 285.938)",
							fontSize: "0.875rem",
						},
					},
					variables: {
						colorPrimary: "rgb(0, 166, 244)",
						colorText: isDark
							? "oklch(0.985 0 0)"
							: "oklch(0.141 0.005 285.823)",
						colorBackground: isDark
							? "oklch(0.21 0.006 285.885)"
							: "oklch(1 0 0)",
						borderRadius: "0.5rem",
						fontFamily: "var(--font-geist-sans)",
					},
				},
			}}
		/>
	);

	const renderStep5 = () => (
		<div className="space-y-6">
			{!hasPremiumAccess && (
				<div className="border border-border/60 dark:border-border/40 rounded-xl p-6 flex items-start gap-3 bg-muted/20">
					<div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 dark:bg-primary/20 shrink-0">
						<Upload className="h-5 w-5 text-primary" />
					</div>
					<div className="flex-1">
						<p className="font-semibold text-foreground mb-1">
							Premium Feature
						</p>
						<p className="text-sm text-muted-foreground">
							CSV import is a premium feature. Upgrade your plan to import
							clients and projects in bulk. You can skip this step and add them
							manually later.
						</p>
					</div>
				</div>
			)}

			{/* Import Clients -- collapsible embedded wizard */}
			{hasPremiumAccess && importState === "collapsed" && (
				<div className="border border-border/60 rounded-xl p-6 flex items-start gap-4 bg-muted/20">
					<Upload className="h-5 w-5 text-muted-foreground mt-0.5" />
					<div className="flex-1">
						<p className="font-semibold text-foreground mb-1">
							Import your existing clients
						</p>
						<p className="text-sm text-muted-foreground">
							Upload a CSV file to import clients in bulk
						</p>
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={() => setImportState("expanded")}
					>
						Import from CSV
					</Button>
				</div>
			)}

			{hasPremiumAccess && importState === "expanded" && (
				<div className="mt-1">
					<ImportWizard
						embedded
						onComplete={(result) => {
							setImportSummary({ count: result.successCount });
							setImportState("completed");
						}}
					/>
				</div>
			)}

			{hasPremiumAccess && importState === "completed" && (
				<div className="flex items-center gap-2 py-4 px-2">
					<Check className="h-5 w-5 text-green-500" />
					<span className="text-sm text-foreground">
						{importSummary?.count} client
						{importSummary?.count === 1 ? "" : "s"} imported successfully
					</span>
				</div>
			)}
		</div>
	);

	const renderCurrentStep = () => {
		switch (currentStep) {
			case 1:
				return renderStep1();
			case 2:
				return renderStep2();
			case 3:
				return renderStep3();
			case 4:
				return renderStep4();
			case 5:
				return renderStep5();
			default:
				return renderStep1();
		}
	};

	const isFinalStep = currentStep === TOTAL_STEPS;
	const isFormStep = currentStep <= 3;

	const handleStepSubmit = (event: React.FormEvent<HTMLFormElement>) => {
		if (currentStep === 1) {
			void handleCreateOrganization(event);
			return;
		}
		event.preventDefault();
		handleNext();
	};

	const stepMotionProps = {
		initial: shouldReduceMotion
			? { opacity: 1 }
			: {
					opacity: 0,
					x: transitionDirection > 0 ? 14 : -14,
					scale: 0.998,
					filter: "blur(4px)",
				},
		animate: { opacity: 1, x: 0, scale: 1, filter: "blur(0px)" },
		exit: shouldReduceMotion
			? { opacity: 0 }
			: {
					opacity: 0,
					x: transitionDirection > 0 ? -10 : 10,
					scale: 0.998,
					filter: "blur(3px)",
				},
		transition: shouldReduceMotion
			? { duration: 0 }
			: { duration: 0.2, ease: "easeOut" as const },
	};

	// Step-1 only: avoids flashing a full-page spinner when advancing 1 → 2 while the webhook syncs.
	if (
		currentStep === 1 &&
		clerkOrganization &&
		(needsCompletion === undefined ||
			organization === undefined ||
			organization === null)
	) {
		return (
			<div className="bg-muted/20 min-h-svh flex items-center justify-center">
				<div className="text-center">
					<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
					<h2 className="text-xl font-semibold text-foreground mb-2">
						Setting up your organization...
					</h2>
					<p className="text-muted-foreground">
						Please wait while we prepare your workspace.
					</p>
				</div>
			</div>
		);
	}

	const submitDisabled =
		currentStep === 1
			? createSubmitting || !orgListLoaded
			: isFinalStep
				? isLoading
				: false;

	return (
		<main className="bg-muted/20 text-foreground relative isolate flex min-h-svh w-full flex-col lg:flex-row">
			<OnboardingPageBackground />

			{/* Stepper sidebar */}
			<aside className="relative z-10 flex w-full shrink-0 border-b px-7 py-6 sm:px-8 lg:min-h-svh lg:w-[18rem] lg:border-b-0 lg:py-10 lg:pr-5 lg:pl-7">
				<div className="flex min-h-full w-full flex-col lg:justify-center">
					<div className="hidden lg:block">
						<OnboardingStepper
							currentStep={currentStep}
							isComplete={false}
							onStepChange={handleStepNavigation}
							steps={ONBOARDING_STEPS}
						/>
					</div>

					{/* Compact horizontal progress on small screens */}
					<p className="text-muted-foreground text-xs lg:hidden">
						Step {currentStep} of {TOTAL_STEPS} — {currentStepMeta.label}
					</p>
				</div>
			</aside>

			{/* Step panel — contained card centered in the remaining space */}
			<section className="relative z-10 flex min-w-0 flex-1 items-center justify-center p-4 sm:p-6 lg:py-10 lg:pr-8 lg:pl-0">
				<Frame
					variant="ghost"
					spacing="xs"
					className="bg-muted/60 dark:bg-muted/10 flex min-h-[42rem] w-full max-w-6xl gap-0 overflow-hidden [--frame-px:--spacing(1.25)] [--frame-py:--spacing(1.25)]"
				>
					<FramePanel className="border-border/40 flex max-h-[calc(100svh-5rem)] flex-1 flex-col overflow-y-auto px-6 py-8 sm:px-10 sm:py-9">
						{/* Logo + back navigation live with the card */}
						<OnboardingHeader
							canGoBack={currentStep > minStep}
							onBack={handlePrevious}
						/>

						<div className="flex flex-1">
							<AnimatePresence mode="wait" initial={false}>
								{(() => {
									const stepBody = (
										<>
											<div className="flex flex-col gap-8">
												<StepHeading
													title={currentStepMeta.title}
													description={currentStepMeta.description}
												/>

												{renderCurrentStep()}
											</div>

											<div className="flex flex-col gap-2 pt-8">
												{error && (
													<p className="text-sm text-destructive" role="alert">
														{error}
													</p>
												)}
												<Button
													type={isFormStep ? "submit" : "button"}
													className="w-full"
													disabled={submitDisabled}
													onClick={
														isFormStep
															? undefined
															: () => {
																	if (isFinalStep) {
																		void handleCompleteSetup();
																	} else {
																		handleNext();
																	}
																}
													}
												>
													{(currentStep === 1 && createSubmitting) ||
													(isFinalStep && isLoading) ? (
														<Loader2
															className="h-4 w-4 animate-spin"
															aria-hidden="true"
														/>
													) : null}
													{currentStep === 1
														? "Create Organization"
														: isFinalStep
															? isLoading
																? "Completing..."
																: "Complete Setup"
															: "Continue"}
												</Button>
											</div>
										</>
									);

									// m-auto centers the step block vertically in the panel;
									// no min-height so the button hugs the content.
									const stepClassName = `m-auto flex w-full flex-col ${STEP_WIDTHS[currentStep]}`;

									// PricingTable / ImportWizard render their own buttons; wrapping
									// them in a form would let those buttons submit it.
									return isFormStep ? (
										<motion.form
											key={currentStepMeta.id}
											className={stepClassName}
											onSubmit={handleStepSubmit}
											noValidate
											{...stepMotionProps}
										>
											{stepBody}
										</motion.form>
									) : (
										<motion.div
											key={currentStepMeta.id}
											className={stepClassName}
											{...stepMotionProps}
										>
											{stepBody}
										</motion.div>
									);
								})()}
							</AnimatePresence>
						</div>
					</FramePanel>
				</Frame>
			</section>
		</main>
	);
}
