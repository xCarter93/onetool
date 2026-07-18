"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import { useOrganization } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { Lock, Mail, Phone, Users, Building2, Globe } from "lucide-react";
import { formatPhoneNumber } from "react-phone-number-input";

import { parseLegacyPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
	InputGroupText,
} from "@/components/ui/input-group";
import { PhoneInput } from "@/components/reui/phone-input";
import {
	Field,
	FieldLabel,
	FieldError,
	FieldDescription,
} from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
	Item,
	ItemContent,
	ItemTitle,
	ItemDescription,
	ItemActions,
} from "@/components/ui/item";
import {
	AddressAutocomplete,
	type AddressData,
} from "@/components/ui/address-autocomplete";
import SelectService from "@/components/shared/choice-set";
import ComboBox from "@/components/ui/combo-box";
import { TIMEZONES } from "@/lib/timezones";
import {
	Frame,
	FrameHeader,
	FrameTitle,
	FrameDescription,
	FramePanel,
} from "@/components/reui/frame";
import { useToast } from "@/hooks/use-toast";
import { api } from "@onetool/backend/convex/_generated/api";
import { useOrgOwner } from "../_hooks/use-org-owner";
import { useSaveValidation } from "../_hooks/use-save-validation";
import { useRegisterSettingsSave } from "../_hooks/use-settings-save";
import { SectionHeading } from "./settings-card";

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

function RequiredMark() {
	return (
		<span aria-hidden="true" className="ml-0.5 text-destructive">
			*
		</span>
	);
}

type BusinessFormState = {
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
	timezone: string;
	logoInvertInDarkMode: boolean;
};

const initialBusinessForm: BusinessFormState = {
	email: "",
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
	timezone: "",
	logoInvertInDarkMode: true,
};

function parseAddress(address?: string) {
	if (!address) {
		return {
			street: "",
			city: "",
			state: "",
			zip: "",
		};
	}

	const parts = address.split(",").map((part) => part.trim());
	let state = parts[2] ?? "";
	let zip = parts[3] ?? "";
	// Legacy values often pack "STATE ZIP" into the final segment (e.g. "IL 62704").
	if (!zip && state) {
		const match = state.match(/^(.*?)\s+(\S+)$/);
		if (match) {
			state = match[1];
			zip = match[2];
		}
	}
	return {
		street: parts[0] ?? "",
		city: parts[1] ?? "",
		state,
		zip,
	};
}

export function BusinessInfoTab() {
	const toast = useToast();
	const { organization, isOwner } = useOrgOwner();
	const { organization: clerkOrganization } = useOrganization();
	const clerkOrgImageUrl = clerkOrganization?.imageUrl;
	const updateOrganization = useMutation(api.organizations.update);
	const { showErrors, markSaveAttempt, clearErrors } = useSaveValidation();

	const [businessForm, setBusinessForm] =
		useState<BusinessFormState>(initialBusinessForm);
	// Stored phone that couldn't be parsed into E.164; kept so the user is told to
	// re-enter it rather than being shown a blank field over a real saved number.
	const [unparsedPhone, setUnparsedPhone] = useState("");
	const [businessDirty, setBusinessDirty] = useState(false);
	const [savingBusiness, setSavingBusiness] = useState(false);

	const controlsDisabled = !isOwner || savingBusiness;

	// Re-sync the form from org data during render whenever org data changes
	// (unless the user has unsaved edits). Seeded with `undefined` so the first
	// render — where the shell has already resolved `organization` — still counts
	// as a change and populates the form.
	const [prevOrganization, setPrevOrganization] =
		useState<typeof organization>(undefined);
	if (organization !== prevOrganization) {
		// Re-seed on org switch (discard stale edits) or when the same org's data
		// changes with no unsaved edits to clobber. Keying off the org id fixes a
		// stale-form bug when switching orgs while dirty.
		const orgIdChanged = organization?._id !== prevOrganization?._id;
		setPrevOrganization(organization);
		if (organization !== undefined && (orgIdChanged || !businessDirty)) {
			if (orgIdChanged) setBusinessDirty(false);
			// Use structured fields if available, otherwise parse from legacy address
			const { street, city, state, zip } = parseAddress(organization?.address);
			const phone = parseLegacyPhone(organization?.phone);
			setUnparsedPhone(phone.unparsed);
			setBusinessForm({
				email: organization?.email ?? "",
				website: organization?.website?.replace(/^https?:\/\//i, "") ?? "",
				phone: phone.value,
				addressStreet: organization?.addressStreet ?? street,
				addressCity: organization?.addressCity ?? city,
				addressState: organization?.addressState ?? state,
				addressZip: organization?.addressZip ?? zip,
				addressCountry: organization?.addressCountry ?? "United States",
				latitude: organization?.latitude ?? null,
				longitude: organization?.longitude ?? null,
				companySize: organization?.companySize ?? "",
				timezone: organization?.timezone ?? "",
				logoInvertInDarkMode: organization?.logoInvertInDarkMode ?? true,
			});
		}
	}

	// Required-field emptiness, evaluated live. `invalid()` only surfaces it after
	// a save attempt so fields glow on Save, not while the user is still filling in.
	const emptyRequired = {
		email: !businessForm.email.trim(),
		phone: !businessForm.phone.trim(),
		addressStreet: !businessForm.addressStreet.trim(),
		addressCity: !businessForm.addressCity.trim(),
		addressState: !businessForm.addressState.trim(),
		addressZip: !businessForm.addressZip.trim(),
		companySize: !businessForm.companySize,
	};
	const invalid = (key: keyof typeof emptyRequired) =>
		showErrors && emptyRequired[key];

	const validateBusinessForm = useCallback(() => {
		const requiredFields = [
			businessForm.email.trim(),
			businessForm.phone.trim(),
			businessForm.addressStreet.trim(),
			businessForm.addressCity.trim(),
			businessForm.addressState.trim(),
			businessForm.addressZip.trim(),
		];
		if (!requiredFields.every(Boolean)) {
			toast.warning(
				"Missing required information",
				"Email, phone, and full mailing address are required.",
			);
			return false;
		}

		if (!businessForm.companySize) {
			toast.warning(
				"Select company size",
				"Choose the option that best represents your team.",
			);
			return false;
		}

		return true;
	}, [businessForm, toast]);

	const handleSaveBusiness = useCallback(async () => {
		if (!isOwner) {
			toast.error(
				"Permission required",
				"Only the organization owner can update business details.",
			);
			return;
		}

		markSaveAttempt();

		if (!validateBusinessForm()) {
			return;
		}

		const normalizedWebsite = businessForm.website.trim()
			? `https://${businessForm.website.trim().replace(/^https?:\/\//i, "")}`
			: undefined;

		setSavingBusiness(true);

		try {
			await updateOrganization({
				email: businessForm.email.trim(),
				phone: businessForm.phone.trim(),
				website: normalizedWebsite,
				// Structured address fields
				addressStreet: businessForm.addressStreet.trim() || undefined,
				addressCity: businessForm.addressCity.trim() || undefined,
				addressState: businessForm.addressState.trim() || undefined,
				addressZip: businessForm.addressZip.trim() || undefined,
				addressCountry: businessForm.addressCountry.trim() || undefined,
				// Geocoding (from Mapbox Address Autofill)
				latitude: businessForm.latitude ?? undefined,
				longitude: businessForm.longitude ?? undefined,
				companySize: businessForm.companySize as "1-10" | "10-100" | "100+",
				timezone: businessForm.timezone || undefined,
				logoUrl: clerkOrgImageUrl ?? undefined,
				logoInvertInDarkMode: businessForm.logoInvertInDarkMode,
			});

			setBusinessDirty(false);
			clearErrors();
			toast.success(
				"Business info updated",
				"Organization details have been saved.",
			);
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Failed to save business information.";
			toast.error("Update failed", message);
		} finally {
			setSavingBusiness(false);
		}
	}, [
		businessForm,
		clearErrors,
		clerkOrgImageUrl,
		isOwner,
		markSaveAttempt,
		toast,
		updateOrganization,
		validateBusinessForm,
	]);

	// Reverts the form to the last-known server values (mirrors the render-time
	// sync above) and calms validation. Registered as the unified footer's
	// "Discard" action.
	const handleDiscard = useCallback(() => {
		const { street, city, state, zip } = parseAddress(organization?.address);
		const phone = parseLegacyPhone(organization?.phone);
		setUnparsedPhone(phone.unparsed);
		setBusinessForm({
			email: organization?.email ?? "",
			website: organization?.website?.replace(/^https?:\/\//i, "") ?? "",
			phone: phone.value,
			addressStreet: organization?.addressStreet ?? street,
			addressCity: organization?.addressCity ?? city,
			addressState: organization?.addressState ?? state,
			addressZip: organization?.addressZip ?? zip,
			addressCountry: organization?.addressCountry ?? "United States",
			latitude: organization?.latitude ?? null,
			longitude: organization?.longitude ?? null,
			companySize: organization?.companySize ?? "",
			timezone: organization?.timezone ?? "",
			logoInvertInDarkMode: organization?.logoInvertInDarkMode ?? true,
		});
		setBusinessDirty(false);
		clearErrors();
	}, [organization, clearErrors]);

	useRegisterSettingsSave({
		dirty: businessDirty,
		saving: savingBusiness,
		canSave: true,
		save: handleSaveBusiness,
		discard: handleDiscard,
		saveLabel: "Save changes",
	});

	// Live preview derivations — read straight off `businessForm` so the
	// letterhead mock updates on every keystroke.
	const orgName = clerkOrganization?.name?.trim() || "Your business name";
	const orgInitial = (clerkOrganization?.name?.trim()?.charAt(0) || "B").toUpperCase();
	const previewStreet = businessForm.addressStreet.trim();
	const previewCityState = [
		businessForm.addressCity.trim(),
		businessForm.addressState.trim(),
	]
		.filter(Boolean)
		.join(", ");
	const previewCityStateZip = [previewCityState, businessForm.addressZip.trim()]
		.filter(Boolean)
		.join(" ");
	// The field now holds E.164; render it the way a client would see it.
	const previewPhone = businessForm.phone
		? formatPhoneNumber(businessForm.phone) || businessForm.phone
		: unparsedPhone;

	return (
		<div className="space-y-6">
			<SectionHeading
				title="Business information"
				description="Keep your public-facing details current — they appear on quotes, invoices, and your client portal."
				aside={
					!isOwner ? (
						<span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium text-muted-foreground">
							<Lock className="h-3 w-3" aria-hidden="true" /> View only
						</span>
					) : undefined
				}
			/>

			<div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
				{/* Form */}
				<div className="space-y-4">
					<Frame>
						<FrameHeader>
							<FrameTitle>Contact</FrameTitle>
						</FrameHeader>
						<FramePanel>
							<div className="flex flex-col gap-5">
								<Field data-invalid={invalid("email") || undefined}>
									<FieldLabel htmlFor="biz-email">
										Business email
										<RequiredMark />
									</FieldLabel>
									<InputGroup className={cn(controlsDisabled && "opacity-70")}>
										<InputGroupAddon>
											<Mail />
										</InputGroupAddon>
										<InputGroupInput
											id="biz-email"
											type="email"
											inputMode="email"
											autoComplete="email"
											placeholder="you@business.com"
											value={businessForm.email}
											disabled={controlsDisabled}
											aria-invalid={invalid("email") || undefined}
											onChange={(event) => {
												setBusinessDirty(true);
												setBusinessForm((prev) => ({
													...prev,
													email: event.target.value,
												}));
											}}
										/>
									</InputGroup>
									{invalid("email") && (
										<FieldError>Business email is required.</FieldError>
									)}
								</Field>

								<div className="grid gap-4 sm:grid-cols-2">
									<Field data-invalid={invalid("phone") || undefined}>
										<FieldLabel htmlFor="biz-phone">
											Phone number
											<RequiredMark />
										</FieldLabel>
										<PhoneInput
											id="biz-phone"
											defaultCountry="US"
											placeholder="(555) 123-4567"
											value={businessForm.phone}
											disabled={controlsDisabled}
											aria-invalid={invalid("phone") || undefined}
											className={cn(controlsDisabled && "opacity-70")}
											onChange={(next) => {
												setBusinessDirty(true);
												setUnparsedPhone("");
												setBusinessForm((prev) => ({
													...prev,
													phone: next ?? "",
												}));
											}}
										/>
										{unparsedPhone && !businessForm.phone && (
											<FieldDescription>
												Saved as “{unparsedPhone}” — re-enter it to store a
												valid number.
											</FieldDescription>
										)}
										{invalid("phone") && (
											<FieldError>Phone number is required.</FieldError>
										)}
									</Field>

									<Field>
										<FieldLabel htmlFor="biz-website">Website</FieldLabel>
										<InputGroup
											className={cn(controlsDisabled && "opacity-70")}
										>
											<InputGroupAddon align="inline-start" className="pr-0">
												<InputGroupText>https://</InputGroupText>
											</InputGroupAddon>
											<InputGroupInput
												id="biz-website"
												type="text"
												inputMode="url"
												autoComplete="url"
												placeholder="acme-cleaning.com"
												value={businessForm.website}
												disabled={controlsDisabled}
												onChange={(event) => {
													setBusinessDirty(true);
													const nextValue = event.target.value.replace(
														/^https?:\/\//i,
														"",
													);
													setBusinessForm((prev) => ({
														...prev,
														website: nextValue,
													}));
												}}
											/>
										</InputGroup>
									</Field>
								</div>
							</div>
						</FramePanel>
					</Frame>

					<Frame>
						<FrameHeader>
							<FrameTitle>Address</FrameTitle>
						</FrameHeader>
						<FramePanel>
							<div className="flex flex-col gap-5">
								<Field data-invalid={invalid("addressStreet") || undefined}>
									<FieldLabel htmlFor="biz-street">
										Street address
										<RequiredMark />
									</FieldLabel>
									<AddressAutocomplete
										id="biz-street"
										value={businessForm.addressStreet}
										onChange={(value) => {
											setBusinessDirty(true);
											setBusinessForm((prev) => ({
												...prev,
												addressStreet: value,
											}));
										}}
										onAddressSelect={(address: AddressData) => {
											setBusinessDirty(true);
											setBusinessForm((prev) => ({
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
										disabled={controlsDisabled}
										aria-invalid={invalid("addressStreet") || undefined}
										placeholder="Start typing your business address…"
									/>
									{invalid("addressStreet") && (
										<FieldError>Street address is required.</FieldError>
									)}
								</Field>

								<div className="grid gap-4 sm:grid-cols-[1.6fr_1.2fr_1fr]">
									<Field data-invalid={invalid("addressCity") || undefined}>
										<FieldLabel htmlFor="biz-city">
											City
											<RequiredMark />
										</FieldLabel>
										<Input
											id="biz-city"
											placeholder="City"
											value={businessForm.addressCity}
											disabled={controlsDisabled}
											aria-invalid={invalid("addressCity") || undefined}
											onChange={(event) => {
												setBusinessDirty(true);
												setBusinessForm((prev) => ({
													...prev,
													addressCity: event.target.value,
												}));
											}}
										/>
										{invalid("addressCity") && (
											<FieldError>Required.</FieldError>
										)}
									</Field>

									<Field data-invalid={invalid("addressState") || undefined}>
										<FieldLabel htmlFor="biz-state">
											State
											<RequiredMark />
										</FieldLabel>
										<Input
											id="biz-state"
											placeholder="State"
											value={businessForm.addressState}
											disabled={controlsDisabled}
											aria-invalid={invalid("addressState") || undefined}
											onChange={(event) => {
												setBusinessDirty(true);
												setBusinessForm((prev) => ({
													...prev,
													addressState: event.target.value,
												}));
											}}
										/>
										{invalid("addressState") && (
											<FieldError>Required.</FieldError>
										)}
									</Field>

									<Field data-invalid={invalid("addressZip") || undefined}>
										<FieldLabel htmlFor="biz-zip">
											ZIP
											<RequiredMark />
										</FieldLabel>
										<Input
											id="biz-zip"
											placeholder="ZIP"
											value={businessForm.addressZip}
											disabled={controlsDisabled}
											aria-invalid={invalid("addressZip") || undefined}
											onChange={(event) => {
												setBusinessDirty(true);
												setBusinessForm((prev) => ({
													...prev,
													addressZip: event.target.value,
												}));
											}}
										/>
										{invalid("addressZip") && (
											<FieldError>Required.</FieldError>
										)}
									</Field>
								</div>
							</div>
						</FramePanel>
					</Frame>

					<Frame>
						<FrameHeader>
							<FrameTitle>Company</FrameTitle>
						</FrameHeader>
						<FramePanel>
							<Field data-invalid={invalid("companySize") || undefined}>
								<FieldLabel>
									How many people work at your company?
									<RequiredMark />
								</FieldLabel>
								<SelectService
									options={companySizeOptions}
									selected={businessForm.companySize}
									disabled={controlsDisabled}
									onChange={(value) => {
										if (controlsDisabled) {
											return;
										}
										setBusinessDirty(true);
										setBusinessForm((prev) => ({
											...prev,
											companySize: value,
										}));
									}}
								/>
								{invalid("companySize") && (
									<FieldError className="text-center">
										Please select your company size.
									</FieldError>
								)}
							</Field>

							<Field className="mt-4">
								<FieldLabel>Timezone</FieldLabel>
								<ComboBox
									options={TIMEZONES}
									value={businessForm.timezone}
									placeholder="Search timezones..."
									disabled={controlsDisabled}
									// Not clearable: organizations.update drops undefined, so a
									// cleared field would revert on reload while showing empty.
									clearable={false}
									onSelect={(tz) => {
										if (!tz) return;
										setBusinessDirty(true);
										setBusinessForm((prev) => ({
											...prev,
											timezone: tz,
										}));
									}}
								/>
								<FieldDescription>
									Used for date and time calculations in automations and
									reports.
								</FieldDescription>
							</Field>
						</FramePanel>
					</Frame>

					<Frame>
						<FrameHeader>
							<FrameTitle>Logo display</FrameTitle>
						</FrameHeader>
						<FramePanel>
							<div className="flex flex-col gap-4">
								<Item variant="muted" size="sm" className="rounded-lg">
									<ItemContent>
										<ItemTitle>Invert logo colors in dark mode</ItemTitle>
										<ItemDescription>
											Enable this if your logo is dark so it stays visible on
											dark backgrounds.
										</ItemDescription>
									</ItemContent>
									<ItemActions>
										<span className="w-14 text-right text-xs text-muted-foreground">
											{businessForm.logoInvertInDarkMode
												? "Enabled"
												: "Disabled"}
										</span>
										<Switch
											checked={businessForm.logoInvertInDarkMode}
											onCheckedChange={(checked) => {
												if (controlsDisabled) {
													return;
												}
												setBusinessDirty(true);
												setBusinessForm((prev) => ({
													...prev,
													logoInvertInDarkMode: Boolean(checked),
												}));
											}}
											disabled={controlsDisabled}
											aria-label="Invert logo colors in dark mode"
										/>
									</ItemActions>
								</Item>

								<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
									<div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-4">
										<span className="text-xs uppercase tracking-wide text-muted-foreground">
											Light mode preview
										</span>
										<div className="flex h-16 w-16 items-center justify-center rounded-lg border border-border bg-white">
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
									<div className="flex flex-col items-center gap-3 rounded-xl border border-border/40 bg-zinc-900 p-4">
										<span className="text-xs uppercase tracking-wide text-zinc-400">
											Dark mode preview
										</span>
										<div className="flex h-16 w-16 items-center justify-center rounded-lg border border-white/10 bg-zinc-900">
											{clerkOrganization?.imageUrl ? (
												<Image
													src={clerkOrganization.imageUrl}
													alt="Logo preview dark"
													width={64}
													height={64}
													className={cn(
														"max-h-12 max-w-full object-contain transition-all duration-200",
														businessForm.logoInvertInDarkMode &&
															"invert brightness-0",
													)}
												/>
											) : (
												<span className="text-xs text-zinc-500">No logo</span>
											)}
										</div>
									</div>
								</div>
							</div>
						</FramePanel>
					</Frame>
				</div>

				{/* Live preview */}
				<Frame className="xl:sticky xl:top-2">
					<FrameHeader>
						<FrameTitle>Preview</FrameTitle>
						<FrameDescription>
							As it appears on quotes &amp; invoices.
						</FrameDescription>
					</FrameHeader>
					<FramePanel className="overflow-hidden p-0">
						<div aria-hidden="true" className="h-1.5 w-full bg-primary" />
						<div className="space-y-4 p-5">
							<div className="flex min-w-0 items-center gap-3">
								<Avatar className="size-11 rounded-lg border border-border">
									<AvatarImage src={clerkOrgImageUrl} alt="" />
									<AvatarFallback className="rounded-lg bg-primary/10 text-sm font-semibold text-primary">
										{orgInitial}
									</AvatarFallback>
								</Avatar>
								<p className="truncate text-base font-semibold tracking-tight text-foreground">
									{orgName}
								</p>
							</div>

							<div className="space-y-0.5 text-sm">
								<p
									className={cn(
										previewStreet
											? "text-foreground/80"
											: "italic text-muted-foreground/60",
									)}
								>
									{previewStreet || "Street address"}
								</p>
								<p
									className={cn(
										previewCityStateZip
											? "text-foreground/80"
											: "italic text-muted-foreground/60",
									)}
								>
									{previewCityStateZip || "City, State ZIP"}
								</p>
							</div>

							<div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
								<span className="inline-flex min-w-0 items-center gap-1.5">
									<Mail className="size-3.5 shrink-0" aria-hidden="true" />
									<span className="truncate">
										{businessForm.email.trim() || "you@business.com"}
									</span>
								</span>
								<span aria-hidden="true" className="text-muted-foreground/40">
									·
								</span>
								<span className="inline-flex items-center gap-1.5">
									<Phone className="size-3.5 shrink-0" aria-hidden="true" />
									{previewPhone || "(555) 123-4567"}
								</span>
								<span aria-hidden="true" className="text-muted-foreground/40">
									·
								</span>
								<span className="inline-flex min-w-0 items-center gap-1.5">
									<Globe className="size-3.5 shrink-0" aria-hidden="true" />
									<span className="truncate">
										{businessForm.website.trim() || "yourbusiness.com"}
									</span>
								</span>
							</div>
						</div>
					</FramePanel>
				</Frame>
			</div>
		</div>
	);
}
