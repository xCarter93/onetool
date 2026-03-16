"use client";

import React, { useMemo, useState, useEffect } from "react";
import { useUser, useOrganization, CreateOrganization } from "@clerk/nextjs";
import { PricingTable } from "@clerk/nextjs";
import { useTheme } from "next-themes";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import ProgressBar, { ProgressStep } from "@/components/shared/progress-bar";
import SelectService from "@/components/shared/choice-set";
import { Input } from "@/components/ui/input";
import {
	AddressAutocomplete,
	type AddressData,
} from "@/components/ui/address-autocomplete";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useAutoTimezone } from "@/hooks/use-auto-timezone";
import { useFeatureAccess } from "@/hooks/use-feature-access";
import { Users, Building2, Globe, Upload } from "lucide-react";
import { api } from "@onetool/backend/convex/_generated/api";
import { StyledButton } from "@/components/ui/styled/styled-button";
import Image from "next/image";

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

export default function CompleteOrganizationMetadata() {
	const { user } = useUser();
	const { organization: clerkOrganization } = useOrganization();
	const { resolvedTheme } = useTheme();
	const router = useRouter();
	const completeMetadata = useMutation(api.organizations.completeMetadata);
	const organization = useQuery(api.organizations.get);
	const needsCompletion = useQuery(api.organizations.needsMetadataCompletion);
	const toast = useToast();

	// Check if user has premium access for import feature
	const { hasPremiumAccess } = useFeatureAccess();

	// Automatically detect and save timezone if not set
	useAutoTimezone();

	const [currentStep, setCurrentStep] = useState(1);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [mounted, setMounted] = useState(false);
	const [hasCreatedOrg, setHasCreatedOrg] = useState(false);

	// Track the initial org ID when in "creating new" mode to detect when a new org is created
	const initialOrgIdRef = React.useRef<string | null>(null);
	const hasInitializedRef = React.useRef(false);
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


	// Check if we're creating a new organization (from query param)
	const [isCreatingNew, setIsCreatingNew] = useState(false);
	const [queryParamsInitialized, setQueryParamsInitialized] = useState(false);

	// Initialize the creating flag from query parameter after mount
	useEffect(() => {
		if (typeof window !== "undefined") {
			const searchParams = new URLSearchParams(window.location.search);
			setIsCreatingNew(searchParams.get("creating") === "true");
			setQueryParamsInitialized(true);
		}
	}, []);

	// Redirect if metadata is already complete
	// Only redirect when organization exists in Convex AND metadata is marked complete
	React.useEffect(() => {
		// Wait for query params to be initialized before running this logic
		if (!queryParamsInitialized) {
			return;
		}

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
	}, [
		needsCompletion,
		organization,
		clerkOrganization,
		router,
		isCreatingNew,
		queryParamsInitialized,
	]);

	// Initialize tracking of the initial org when in "creating new" mode
	useEffect(() => {
		// Wait for query params to be initialized
		if (!queryParamsInitialized) {
			return;
		}

		if (!hasInitializedRef.current && isCreatingNew) {
			initialOrgIdRef.current = clerkOrganization?.id || null;
			hasInitializedRef.current = true;
		}
	}, [clerkOrganization, isCreatingNew, queryParamsInitialized]);

	// Check if user already has an organization - if so, skip step 1
	// BUT: If creating a new org, wait until the org ID changes (indicating new org was created)
	useEffect(() => {
		// Wait for query params to be initialized before running this logic
		if (!queryParamsInitialized) {
			return;
		}

		if (clerkOrganization && !hasCreatedOrg) {
			// If we're in "creating new org" mode
			if (isCreatingNew) {
				// Check if the org ID has changed from the initial one
				const currentOrgId = clerkOrganization.id;
				const initialOrgId = initialOrgIdRef.current;

				// Only advance if the org ID changed (meaning they created a new org)
				if (initialOrgId && currentOrgId !== initialOrgId) {
					setHasCreatedOrg(true);
					if (currentStep === 1) {
						setCurrentStep(2);
					}
				}
				// If org ID hasn't changed, stay on step 1
			} else {
				// Normal flow: user already has an org, skip step 1
				setHasCreatedOrg(true);
				if (currentStep === 1) {
					setCurrentStep(2);
				}
			}
		}
	}, [
		clerkOrganization,
		hasCreatedOrg,
		currentStep,
		isCreatingNew,
		queryParamsInitialized,
	]);

	// Prevent hydration mismatch
	React.useEffect(() => {
		setMounted(true);
	}, []);

	const currentTheme = mounted ? resolvedTheme : "light";
	const isDark = currentTheme === "dark";

	const progressSteps: ProgressStep[] = [
		{
			id: "1",
			name: "Create Organization",
			description: "Set up your organization",
			status:
				currentStep === 1
					? "current"
					: currentStep > 1
					? "complete"
					: "upcoming",
		},
		{
			id: "2",
			name: "Business Info",
			description: "Company details and contact information",
			status:
				currentStep === 2
					? "current"
					: currentStep > 2
					? "complete"
					: "upcoming",
		},
		{
			id: "3",
			name: "Company Size",
			description: "Help us understand your team",
			status:
				currentStep === 3
					? "current"
					: currentStep > 3
					? "complete"
					: "upcoming",
		},
		{
			id: "4",
			name: "Choose Your Plan",
			description: "Select the plan that fits your needs",
			status:
				currentStep === 4
					? "current"
					: currentStep > 4
					? "complete"
					: "upcoming",
		},
		{
			id: "5",
			name: "Import Data",
			description: "Import existing clients or projects (optional)",
			status:
				currentStep === 5
					? "current"
					: currentStep > 5
					? "complete"
					: "upcoming",
		},
	];

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

	const handleNext = () => {
		setError(null);
		if (currentStep === 2 && !isStep2Complete()) {
			toast.warning(
				"Missing Required Information",
				"Please complete business email, phone number, and full address to continue."
			);
			return;
		}

		if (currentStep < 5) {
			setCurrentStep(currentStep + 1);
		}
	};

	const handlePrevious = () => {
		setError(null);
		if (currentStep > 1) {
			setCurrentStep(currentStep - 1);
		}
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
		// First complete metadata
		await handleCompleteMetadata();

		// Then navigate to home
		router.push("/home");
	};

	const handleCompleteMetadata = async () => {
		setError(null);

		// Basic validation
		if (!isStep2Complete()) {
			toast.warning(
				"Missing Required Information",
				"Please complete business email, phone number, and full address to finish setup."
			);
			return;
		}

		if (!formData.companySize) {
			setError("Please select a company size before completing setup.");
			return;
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
		} catch (err) {
			console.error("Failed to complete organization metadata:", err);
			setError(
				err instanceof Error
					? err.message
					: "Failed to save organization settings. Please try again."
			);
		} finally {
			setIsLoading(false);
		}
	};

	const renderStep1 = () => (
		<div className="space-y-8 flex flex-col items-center">
			<div className="w-full max-w-2xl text-center">
				<div className="flex items-center justify-center gap-3 mb-3">
					<div className="w-1.5 h-6 bg-linear-to-b from-primary to-primary/60 rounded-full" />
					<h2 className="text-2xl font-semibold text-foreground tracking-tight">
						Create Your Organization
					</h2>
				</div>
				<p className="text-muted-foreground leading-relaxed">
					Set up your organization to get started with OneTool.
				</p>
			</div>

			{/* Clerk Create Organization Component */}
			<div className="mt-6 w-full max-w-2xl">
				<CreateOrganization
					appearance={{
						elements: {
							rootBox: {
								width: "100%",
								margin: "0 auto",
							},
							card: {
								backgroundColor: "transparent",
								border: "none",
								boxShadow: "none",
								padding: "0",
								width: "100%",
							},
							cardBox: {
								padding: "0",
								width: "100%",
							},
							headerTitle: {
								display: "none", // Hide default header since we have our own
							},
							headerSubtitle: {
								display: "none", // Hide default subtitle
							},
							form: {
								gap: "1.5rem",
								width: "100%",
							},
							formFieldRow: {
								width: "100%",
							},
							formContainer: {
								width: "100%",
								height: "100%",
								display: "flex",
								justifyContent: "center",
								padding: "5px",
							},

							// Form styling
							formButtonPrimary: {
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
								width: "100%",
							},
							formFieldInput: {
								backgroundColor: isDark
									? "oklch(0.32 0.013 285.805)"
									: "oklch(0.871 0.006 286.286)",
								color: isDark
									? "oklch(0.985 0 0)"
									: "oklch(0.141 0.005 285.823)",
								border: `1px solid ${
									isDark
										? "oklch(0.27 0.013 285.805)"
										: "oklch(0.911 0.006 286.286)"
								}`,
								borderRadius: "var(--radius-md)",
								padding: "0.625rem 1rem",
								width: "100%",
							},
							formFieldLabel: {
								color: isDark
									? "oklch(0.985 0 0)"
									: "oklch(0.141 0.005 285.823)",
								fontSize: "0.875rem",
								fontWeight: "500",
								marginBottom: "0.5rem",
							},

							// Footer styling
							footer: "mt-8 pt-6 border-t border-border dark:border-border",
							footerActionText:
								"text-xs text-muted-foreground dark:text-muted-foreground",
							footerActionLink:
								"text-primary hover:text-primary/80 dark:text-primary dark:hover:text-primary/80 font-medium text-xs",

							// Error and success styling
							formFieldSuccessText:
								"text-green-600 dark:text-green-400 text-sm",
							formFieldErrorText: "text-red-600 dark:text-red-400 text-sm",
							formFieldWarningText:
								"text-yellow-600 dark:text-yellow-400 text-sm",

							// Loading states
							formFieldInputPlaceholder:
								"text-muted-foreground dark:text-muted-foreground",
							spinner: "text-primary dark:text-primary",

							// Modal/popover styling (if any)
							modalContent:
								"bg-card dark:bg-card border-border dark:border-border shadow-xl dark:shadow-xl",
							modalCloseButton:
								"text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground",

							// Additional dark mode elements
							identityPreview:
								"bg-background dark:bg-card border-border dark:border-border",
							identityPreviewText: "text-foreground dark:text-foreground",
							identityPreviewEditButton:
								"text-primary hover:text-primary/80 dark:text-primary dark:hover:text-primary/80",
						},
						variables: {
							// Color system that works in both light and dark mode
							colorPrimary: "rgb(0, 166, 244)",
							colorDanger: "hsl(var(--destructive))",
							colorSuccess: "hsl(var(--green-600))",
							colorWarning: "hsl(var(--yellow-600))",
							colorNeutral: "hsl(var(--muted-foreground))",

							// Background colors
							colorBackground: "transparent",
							colorInputBackground: "hsl(var(--background))",

							// Text colors
							colorText: "hsl(var(--foreground))",
							colorTextSecondary: "hsl(var(--muted-foreground))",
							colorInputText: "hsl(var(--foreground))",
							colorTextOnPrimaryBackground: "hsl(var(--primary-foreground))",

							// Typography
							fontFamily: "inherit",
							fontFamilyButtons: "inherit",
							fontSize: "0.875rem",
							fontWeight: {
								normal: "400",
								medium: "500",
								semibold: "600",
								bold: "700",
							},

							// Spacing and shapes
							borderRadius: "0.5rem",
							spacingUnit: "1rem",
						},
					}}
					afterCreateOrganizationUrl="/organization/complete"
					skipInvitationScreen={true}
					hideSlug={true}
				/>
			</div>

			{/* Help Text */}
			<div className="mt-6 text-center">
				<p className="text-xs text-muted-foreground">
					After creating your organization, you&apos;ll continue to the next
					steps to complete setup.
				</p>
			</div>
		</div>
	);

	const renderStep2 = () => (
		<div className="space-y-8">
			<div>
				<div className="flex items-center gap-3 mb-3">
					<div className="w-1.5 h-6 bg-linear-to-b from-primary to-primary/60 rounded-full" />
					<h2 className="text-2xl font-semibold text-foreground tracking-tight">
						Business Information
					</h2>
				</div>
				<p className="text-muted-foreground ml-5 leading-relaxed">
					Tell us more about your business to customize your experience.
				</p>
			</div>

			<div className="space-y-6">
				<div>
					<label className="block text-sm font-semibold text-foreground mb-3 tracking-wide">
						Business Email
					</label>
					<Input
						value={formData.email}
						onChange={(e) =>
							setFormData({ ...formData, email: e.target.value })
						}
						className="w-full border-border dark:border-border bg-background dark:bg-background focus:bg-background dark:focus:bg-background transition-colors shadow-sm ring-1 ring-border/10"
						placeholder="your.business@company.com"
						type="email"
					/>
				</div>

				<div>
					<label className="block text-sm font-semibold text-foreground mb-3 tracking-wide">
						Company Website
					</label>
					<div className="mt-2 flex">
						<span className="flex shrink-0 items-center rounded-l-md border border-border bg-muted/40 px-3 text-sm font-medium text-muted-foreground">
							https://
						</span>
						<Input
							value={formData.website}
							onChange={(e) =>
								setFormData({
									...formData,
									website: e.target.value.replace(/^https?:\/\//i, ""),
								})
							}
							className="w-full rounded-l-none border border-l-0 border-border dark:border-border bg-background dark:bg-background focus:bg-background dark:focus:bg-background transition-colors shadow-sm ring-1 ring-border/10"
							placeholder="www.yourcompany.com"
							type="text"
						/>
					</div>
				</div>

				<div>
					<label className="block text-sm font-semibold text-foreground mb-3 tracking-wide">
						Phone Number
					</label>
					<Input
						value={formData.phone}
						onChange={(e) =>
							setFormData({ ...formData, phone: e.target.value })
						}
						className="w-full border-border dark:border-border bg-background dark:bg-background focus:bg-background dark:focus:bg-background transition-colors shadow-sm ring-1 ring-border/10"
						placeholder="+1 (555) 123-4567"
						type="tel"
					/>
				</div>

				<div>
					<label className="block text-sm font-semibold text-foreground mb-3 tracking-wide">
						Business Address
					</label>
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="sm:col-span-2">
							<AddressAutocomplete
								value={formData.addressStreet}
								onChange={(value) =>
									setFormData({ ...formData, addressStreet: value })
								}
								onAddressSelect={(address: AddressData) => {
									setFormData({
										...formData,
										addressStreet: address.streetAddress,
										addressCity: address.city,
										addressState: address.state,
										addressZip: address.zipCode,
										addressCountry: address.country,
										latitude: address.latitude,
										longitude: address.longitude,
									});
								}}
								className="w-full border-border dark:border-border bg-background dark:bg-background focus:bg-background dark:focus:bg-background transition-colors shadow-sm ring-1 ring-border/10"
								placeholder="Start typing your business address..."
							/>
						</div>
						<div>
							<Input
								value={formData.addressCity}
								onChange={(e) =>
									setFormData({ ...formData, addressCity: e.target.value })
								}
								className="w-full border-border dark:border-border bg-background dark:bg-background focus:bg-background dark:focus:bg-background transition-colors shadow-sm ring-1 ring-border/10"
								placeholder="City"
							/>
						</div>
						<div className="grid grid-cols-2 gap-4">
							<Input
								value={formData.addressState}
								onChange={(e) =>
									setFormData({ ...formData, addressState: e.target.value })
								}
								className="w-full border-border dark:border-border bg-background dark:bg-background focus:bg-background dark:focus:bg-background transition-colors shadow-sm ring-1 ring-border/10"
								placeholder="State"
							/>
							<Input
								value={formData.addressZip}
								onChange={(e) =>
									setFormData({ ...formData, addressZip: e.target.value })
								}
								className="w-full border-border dark:border-border bg-background dark:bg-background focus:bg-background dark:focus:bg-background transition-colors shadow-sm ring-1 ring-border/10"
								placeholder="ZIP"
							/>
						</div>
					</div>
				</div>

				<div>
					<label className="block text-sm font-semibold text-foreground mb-3 tracking-wide">
						Logo Display Preferences
					</label>
					<div className="space-y-4 border border-border dark:border-border/80 rounded-xl p-5">
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
							<div className="border border-border/60 dark:border-border/40 rounded-lg p-4 flex flex-col items-center gap-3 bg-white">
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
										<span className="text-xs text-muted-foreground">
											No logo
										</span>
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
										<span className="text-xs text-muted-foreground">
											No logo
										</span>
									)}
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			<div className="flex justify-end pt-6">
				<StyledButton
					type="button"
					onClick={handleNext}
					intent="primary"
					size="md"
					showArrow={false}
				>
					Next Step
				</StyledButton>
			</div>
		</div>
	);

	const renderStep3 = () => (
		<div className="space-y-8">
			<div>
				<div className="flex items-center gap-3 mb-3">
					<div className="w-1.5 h-6 bg-linear-to-b from-primary to-primary/60 rounded-full" />
					<h2 className="text-2xl font-semibold text-foreground tracking-tight">
						Company Size
					</h2>
				</div>
				<p className="text-muted-foreground ml-5 leading-relaxed">
					Help us understand your team size to provide the best experience.
				</p>
			</div>

			<div>
				<label className="block text-sm font-semibold text-foreground mb-6 tracking-wide">
					How many people work at your company? *
				</label>
				<SelectService
					options={companySizeOptions}
					selected={formData.companySize}
					onChange={(value) => setFormData({ ...formData, companySize: value })}
				/>
			</div>

			<div className="flex justify-between pt-6">
				<StyledButton
					type="button"
					onClick={handlePrevious}
					intent="secondary"
					size="md"
					showArrow={false}
				>
					Previous
				</StyledButton>
				<StyledButton
					type="button"
					onClick={handleNext}
					intent="primary"
					size="md"
					showArrow={false}
				>
					Next Step
				</StyledButton>
			</div>
		</div>
	);

	const renderStep4 = () => (
		<div className="space-y-8">
			<div>
				<div className="flex items-center gap-3 mb-3">
					<div className="w-1.5 h-6 bg-linear-to-b from-primary to-primary/60 rounded-full" />
					<h2 className="text-2xl font-semibold text-foreground tracking-tight">
						Choose Your Plan
					</h2>
				</div>
				<p className="text-muted-foreground ml-5 leading-relaxed">
					Select the plan that best fits your business needs. You can upgrade or
					downgrade anytime.
				</p>
			</div>

			<div className="mt-8">
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
								color: isDark
									? "oklch(0.985 0 0)"
									: "oklch(0.141 0.005 285.823)",
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
								color: isDark
									? "oklch(0.985 0 0)"
									: "oklch(0.141 0.005 285.823)",
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
								color: isDark
									? "oklch(0.985 0 0)"
									: "oklch(0.141 0.005 285.823)",
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
							colorText: isDark
								? "oklch(0.985 0 0)"
								: "oklch(0.141 0.005 285.823)",
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
			</div>

			<div className="flex justify-between pt-6">
				<StyledButton
					type="button"
					onClick={handlePrevious}
					intent="secondary"
					size="md"
					showArrow={false}
				>
					Previous
				</StyledButton>
				<StyledButton
					type="button"
					onClick={handleNext}
					intent="primary"
					size="md"
					showArrow={false}
				>
					Next Step
				</StyledButton>
			</div>
		</div>
	);

	const renderStep5 = () => (
		<div className="space-y-8">
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

			{/* Import Clients -- simple link to wizard (Phase 5 will build embedded experience) */}
			<div className="flex flex-col items-center gap-3 py-8">
				<Upload className="h-8 w-8 text-muted-foreground" />
				<p className="text-sm text-muted-foreground">Import your existing clients from a CSV file</p>
				<StyledButton
					intent="outline"
					size="md"
					onClick={() => router.push("/clients/import")}
					label="Import Clients"
				/>
			</div>

			{/* Action Buttons */}
			<div className="flex justify-between pt-6">
				<StyledButton
					type="button"
					onClick={handlePrevious}
					intent="secondary"
					size="md"
					disabled={isLoading}
					showArrow={false}
				>
					Previous
				</StyledButton>

				<div className="flex gap-3">
					<StyledButton
						intent="primary"
						onClick={handleCompleteSetup}
						isLoading={isLoading}
					>
						{isLoading ? "Completing..." : "Complete Setup"}
					</StyledButton>
				</div>
			</div>
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

	// Show loading state while webhook is processing organization creation
	// Show loading if:
	// 1. User has created a Clerk org AND
	// 2. Either needsCompletion or organization data hasn't loaded yet (undefined) OR
	// 3. Organization doesn't exist in Convex yet (null) - waiting for webhook
	if (
		clerkOrganization &&
		(needsCompletion === undefined ||
			organization === undefined ||
			organization === null)
	) {
		return (
			<div className="min-h-screen flex-1 flex items-center justify-center">
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

	return (
		<div className="relative p-4 sm:p-6 lg:p-8 min-h-screen flex flex-col">
			<div className="flex-1 flex flex-col py-8 mx-auto w-full">
				{/* Enhanced Header */}
				<div className="mb-10">
					<div className="flex items-center gap-3 mb-3">
						<div className="w-2 h-8 bg-linear-to-b from-primary to-primary/60 rounded-full" />
						<h1 className="text-3xl font-bold bg-linear-to-r from-foreground to-foreground/70 bg-clip-text text-transparent tracking-tight">
							{currentStep === 1
								? "Create Your Organization"
								: "Complete Your Organization Setup"}
						</h1>
					</div>
					<p className="text-muted-foreground ml-5 leading-relaxed">
						{currentStep === 1
							? "Let's get started by setting up your organization."
							: organization?.name
							? `Welcome to ${organization.name}! Let's finish setting up your organization.`
							: "Let's finish setting up your organization."}
					</p>
				</div>

				{/* Enhanced Progress Bar */}
				<div className="mb-10">
					<ProgressBar steps={progressSteps} />
				</div>

				{/* Enhanced Form Content */}
				<div className="bg-card dark:bg-card backdrop-blur-md border border-border dark:border-border rounded-2xl p-10 shadow-lg dark:shadow-black/50 ring-1 ring-border/30 dark:ring-border/50 shrink-0">
					{renderCurrentStep()}
				</div>
			</div>
		</div>
	);
}
