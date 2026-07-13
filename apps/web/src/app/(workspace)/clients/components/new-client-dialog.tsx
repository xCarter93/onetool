/* eslint-disable react/no-children-prop */
"use client";

import React, { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm, useStore } from "@tanstack/react-form";
import * as z from "zod/v3";
import { useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";

import { CreateRecordDialog } from "@/components/domain/create-record-dialog";
import { TagsInput } from "@/components/shared/tags-input";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { MailIcon, MessagesSquareIcon, SmartphoneIcon } from "lucide-react";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSet,
	FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/reui/phone-input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	AddressAutocomplete,
	type AddressData,
} from "@/components/ui/address-autocomplete";
import { useToast } from "@/hooks/use-toast";

type ClientId = Id<"clients">;
type ClientStatus = "lead" | "active" | "inactive" | "archived";
type LeadSource = z.infer<typeof leadSourceSchema>;
type PropertyType = z.infer<typeof propertyTypeSchema>;
type CommunicationPreference = "email" | "phone" | "both";

const leadSourceSchema = z.enum([
	"word-of-mouth",
	"website",
	"social-media",
	"referral",
	"advertising",
	"trade-show",
	"cold-outreach",
	"other",
]);

const propertyTypeSchema = z.enum([
	"residential",
	"commercial",
	"industrial",
	"retail",
	"office",
	"mixed-use",
]);

const clientSchema = z.object({
	// Company
	companyName: z.string().trim().min(1, "Company name is required"),
	status: z.enum(["lead", "active", "inactive", "archived"]),
	leadSource: leadSourceSchema.nullable(),
	companyDescription: z.string(),

	// Primary contact
	firstName: z.string().trim().min(1, "First name is required"),
	lastName: z.string().trim().min(1, "Last name is required"),
	email: z
		.string()
		.trim()
		.min(1, "Email address is required")
		.email("Enter a valid email address"),
	phone: z.string(),
	jobTitle: z.string(),

	// Primary property (optional — only saved when a street address is entered)
	propertyName: z.string(),
	propertyType: propertyTypeSchema.nullable(),
	streetAddress: z.string(),
	city: z.string(),
	state: z.string(),
	zipCode: z.string(),
	country: z.string(),
	latitude: z.number().nullable(),
	longitude: z.number().nullable(),
	formattedAddress: z.string(),

	// Preferences
	communicationPreference: z.enum(["email", "phone", "both"]).nullable(),
	tags: z.array(z.string()),
	notes: z.string(),
});

// The property mutation rejects a blank city/state/zip, so an entered street
// address promotes the rest of the address block to required.
const formSchema = clientSchema.superRefine((data, ctx) => {
	if (!data.streetAddress.trim()) return;

	const required: Array<[keyof typeof data, string]> = [
		["city", "City is required for the address"],
		["state", "State is required for the address"],
		["zipCode", "ZIP code is required for the address"],
	];

	for (const [path, message] of required) {
		if (!String(data[path] ?? "").trim()) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
		}
	}
});

type ClientFormValues = z.infer<typeof clientSchema>;

const DEFAULT_COUNTRY = "United States";

const EMPTY_VALUES: ClientFormValues = {
	companyName: "",
	status: "lead",
	leadSource: null,
	companyDescription: "",

	firstName: "",
	lastName: "",
	email: "",
	phone: "",
	jobTitle: "",

	propertyName: "",
	propertyType: null,
	streetAddress: "",
	city: "",
	state: "",
	zipCode: "",
	country: "",
	latitude: null,
	longitude: null,
	formattedAddress: "",

	communicationPreference: null,
	tags: [] as string[],
	notes: "",
};

const STATUS_OPTIONS: Array<{ value: ClientStatus; label: string }> = [
	{ value: "lead", label: "Lead" },
	{ value: "active", label: "Active" },
	{ value: "inactive", label: "Inactive" },
	{ value: "archived", label: "Archived" },
];

const LEAD_SOURCE_OPTIONS: Array<{ value: LeadSource; label: string }> = [
	{ value: "word-of-mouth", label: "Word of mouth" },
	{ value: "website", label: "Website" },
	{ value: "social-media", label: "Social media" },
	{ value: "referral", label: "Referral" },
	{ value: "advertising", label: "Advertising" },
	{ value: "trade-show", label: "Trade show" },
	{ value: "cold-outreach", label: "Cold outreach" },
	{ value: "other", label: "Other" },
];

const COMMUNICATION_OPTIONS: Array<{
	value: CommunicationPreference;
	label: string;
	icon: typeof MailIcon;
}> = [
	{ value: "email", label: "Email", icon: MailIcon },
	{ value: "phone", label: "Phone", icon: SmartphoneIcon },
	{ value: "both", label: "Both", icon: MessagesSquareIcon },
];

const PROPERTY_TYPE_OPTIONS: Array<{ value: PropertyType; label: string }> = [
	{ value: "residential", label: "Residential" },
	{ value: "commercial", label: "Commercial" },
	{ value: "industrial", label: "Industrial" },
	{ value: "retail", label: "Retail" },
	{ value: "office", label: "Office" },
	{ value: "mixed-use", label: "Mixed-use" },
];

interface NewClientDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onOpenChangeComplete?: (open: boolean) => void;
}

/**
 * Quick-create: client + one primary contact + one optional primary property.
 * Additional contacts and properties are added afterwards on the client page,
 * which has inline editors for both.
 */
export function NewClientDialog({
	open,
	onOpenChange,
	onOpenChangeComplete,
}: NewClientDialogProps) {
	const router = useRouter();
	const toast = useToast();

	const createClient = useMutation(api.clients.create);
	const createContact = useMutation(api.clientContacts.create);
	const createProperty = useMutation(api.clientProperties.create);

	const form = useForm({
		defaultValues: EMPTY_VALUES,
		validators: { onSubmit: formSchema },
		onSubmit: async ({ value }) => {
			const companyName = value.companyName.trim();
			let clientId: ClientId;

			try {
				clientId = await createClient({
					companyName,
					companyDescription: value.companyDescription.trim() || undefined,
					status: value.status,
					leadSource: value.leadSource ?? undefined,
					communicationPreference: value.communicationPreference ?? undefined,
					tags: value.tags.length > 0 ? value.tags : undefined,
					notes: value.notes.trim() || undefined,
					// Generated client-side: Convex retries mutations, so a server-side
					// UUID would not be deterministic.
					portalAccessId: crypto.randomUUID(),
				});
			} catch (error) {
				console.error("Failed to create client:", error);
				toast.error("Error", "Failed to create client. Please try again.");
				return;
			}

			// The sub-records are separate, non-atomic mutations. The client already
			// exists at this point, so failures warn instead of failing the create.
			const dropped: string[] = [];

			try {
				await createContact({
					clientId,
					firstName: value.firstName.trim(),
					lastName: value.lastName.trim(),
					email: value.email.trim() || undefined,
					phone: value.phone.trim() || undefined,
					jobTitle: value.jobTitle.trim() || undefined,
					isPrimary: true,
				});
			} catch (error) {
				console.error("Failed to create primary contact:", error);
				dropped.push("contact");
			}

			if (value.streetAddress.trim()) {
				try {
					await createProperty({
						clientId,
						propertyName: value.propertyName.trim() || undefined,
						propertyType: value.propertyType ?? undefined,
						streetAddress: value.streetAddress.trim(),
						city: value.city.trim(),
						state: value.state.trim(),
						zipCode: value.zipCode.trim(),
						// Only Mapbox's onRetrieve fills country; hand-typed addresses (and
						// the plain-Input fallback when no Mapbox key is set) leave it blank.
						country: value.country.trim() || DEFAULT_COUNTRY,
						latitude: value.latitude ?? undefined,
						longitude: value.longitude ?? undefined,
						formattedAddress: value.formattedAddress.trim() || undefined,
						isPrimary: true,
					});
				} catch (error) {
					console.error("Failed to create primary property:", error);
					dropped.push("address");
				}
			}

			onOpenChange(false);
			form.reset();

			// The dialog preserves the user's place in the list, so we never navigate —
			// the toast carries the way in.
			const action = {
				label: "View client",
				onClick: () => router.push(`/clients/${clientId}`),
			};

			if (dropped.length > 0) {
				toast.warning(
					"Client created",
					`The ${dropped.join(" and ")} could not be saved — add ${
						dropped.length > 1 ? "them" : "it"
					} on the client page.`,
					{ action }
				);
				return;
			}

			toast.success("Client created", `${companyName} has been added.`, {
				action,
			});
		},
	});

	const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

	// Re-seed defaults only on the false→true edge; re-running while open would
	// wipe whatever the user has already typed.
	const wasOpen = useRef(open);
	useEffect(() => {
		const rising = open && !wasOpen.current;
		wasOpen.current = open;
		if (rising) form.reset(EMPTY_VALUES);
	}, [open, form]);

	const handleAddressSelect = (address: AddressData) => {
		form.setFieldValue("streetAddress", address.streetAddress);
		form.setFieldValue("city", address.city);
		form.setFieldValue("state", address.state);
		form.setFieldValue("zipCode", address.zipCode);
		form.setFieldValue("country", address.country);
		form.setFieldValue("latitude", address.latitude);
		form.setFieldValue("longitude", address.longitude);
		form.setFieldValue("formattedAddress", address.formattedAddress);
	};

	return (
		<CreateRecordDialog
			open={open}
			onOpenChange={onOpenChange}
			onOpenChangeComplete={onOpenChangeComplete}
			title="New client"
			description="Capture the essentials — more contacts and properties can be added on the client page."
			submitLabel="Create client"
			isSubmitting={isSubmitting}
			onSubmit={() => form.handleSubmit()}
		>
			<div className="flex flex-col gap-8">
				<FieldSet>
					<FieldLegend variant="label">Company</FieldLegend>
					<FieldGroup className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
						<form.Field
							name="companyName"
							validators={{ onChange: clientSchema.shape.companyName }}
							children={(field) => {
								const isInvalid = field.state.meta.errors.length > 0;
								return (
									<Field data-invalid={isInvalid}>
										<FieldLabel htmlFor={field.name}>Company name *</FieldLabel>
										<Input
											id={field.name}
											name={field.name}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											aria-invalid={isInvalid}
											placeholder="e.g., Acme Cleaning Co."
											autoComplete="organization"
											disabled={isSubmitting}
										/>
										{isInvalid && <FieldError errors={field.state.meta.errors} />}
									</Field>
								);
							}}
						/>

						<form.Field
							name="status"
							children={(field) => (
								<Field>
									<FieldLabel htmlFor={field.name}>Status</FieldLabel>
									<Select
										value={field.state.value}
										onValueChange={(value) =>
											field.handleChange(value as ClientStatus)
										}
										disabled={isSubmitting}
									>
										<SelectTrigger id={field.name}>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{STATUS_OPTIONS.map((option) => (
												<SelectItem key={option.value} value={option.value}>
													{option.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</Field>
							)}
						/>

						<form.Field
							name="leadSource"
							children={(field) => (
								<Field>
									<FieldLabel htmlFor={field.name}>Lead source</FieldLabel>
									<Select
										value={field.state.value}
										onValueChange={(value) =>
											field.handleChange(value as LeadSource | null)
										}
										disabled={isSubmitting}
									>
										<SelectTrigger id={field.name}>
											<SelectValue placeholder="Select source" />
										</SelectTrigger>
										<SelectContent>
											{LEAD_SOURCE_OPTIONS.map((option) => (
												<SelectItem key={option.value} value={option.value}>
													{option.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</Field>
							)}
						/>

						<form.Field
							name="companyDescription"
							children={(field) => (
								<Field className="sm:col-span-2">
									<FieldLabel htmlFor={field.name}>Description</FieldLabel>
									<Textarea
										id={field.name}
										name={field.name}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										rows={2}
										placeholder="What does this company do?"
										disabled={isSubmitting}
									/>
								</Field>
							)}
						/>
					</FieldGroup>
				</FieldSet>

				<FieldSet>
					<FieldLegend variant="label">Primary contact</FieldLegend>
					<FieldGroup className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
						<form.Field
							name="firstName"
							validators={{ onChange: clientSchema.shape.firstName }}
							children={(field) => {
								const isInvalid = field.state.meta.errors.length > 0;
								return (
									<Field data-invalid={isInvalid}>
										<FieldLabel htmlFor={field.name}>First name *</FieldLabel>
										<Input
											id={field.name}
											name={field.name}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											aria-invalid={isInvalid}
											placeholder="Jane"
											autoComplete="given-name"
											disabled={isSubmitting}
										/>
										{isInvalid && <FieldError errors={field.state.meta.errors} />}
									</Field>
								);
							}}
						/>

						<form.Field
							name="lastName"
							validators={{ onChange: clientSchema.shape.lastName }}
							children={(field) => {
								const isInvalid = field.state.meta.errors.length > 0;
								return (
									<Field data-invalid={isInvalid}>
										<FieldLabel htmlFor={field.name}>Last name *</FieldLabel>
										<Input
											id={field.name}
											name={field.name}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											aria-invalid={isInvalid}
											placeholder="Doe"
											autoComplete="family-name"
											disabled={isSubmitting}
										/>
										{isInvalid && <FieldError errors={field.state.meta.errors} />}
									</Field>
								);
							}}
						/>

						<form.Field
							name="email"
							validators={{ onBlur: clientSchema.shape.email }}
							children={(field) => {
								const isInvalid = field.state.meta.errors.length > 0;
								return (
									<Field data-invalid={isInvalid}>
										<FieldLabel htmlFor={field.name}>Email address *</FieldLabel>
										<Input
											id={field.name}
											name={field.name}
											type="email"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											aria-invalid={isInvalid}
											placeholder="jane@example.com"
											autoComplete="email"
											disabled={isSubmitting}
										/>
										{isInvalid && <FieldError errors={field.state.meta.errors} />}
									</Field>
								);
							}}
						/>

						<form.Field
							name="phone"
							children={(field) => (
								<Field>
									<FieldLabel htmlFor={field.name}>Phone</FieldLabel>
									{/* Stores E.164 ("+15551234567"), or "" when cleared. */}
									<PhoneInput
										id={field.name}
										name={field.name}
										defaultCountry="US"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(next) => field.handleChange(next ?? "")}
										placeholder="(555) 123-4567"
										disabled={isSubmitting}
									/>
								</Field>
							)}
						/>

						<form.Field
							name="jobTitle"
							children={(field) => (
								<Field>
									<FieldLabel htmlFor={field.name}>Job title</FieldLabel>
									<Input
										id={field.name}
										name={field.name}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder="Operations manager"
										autoComplete="organization-title"
										disabled={isSubmitting}
									/>
								</Field>
							)}
						/>
					</FieldGroup>
				</FieldSet>

				<FieldSet>
					<FieldLegend variant="label">Primary address (optional)</FieldLegend>
					<FieldDescription>
						Add the main service address. Leave blank to add properties later.
					</FieldDescription>
					<FieldGroup className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
						<form.Field
							name="streetAddress"
							children={(field) => (
								<Field className="sm:col-span-2">
									<FieldLabel htmlFor={field.name}>Street address</FieldLabel>
									<AddressAutocomplete
										id={field.name}
										name={field.name}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(value) => field.handleChange(value)}
										onAddressSelect={handleAddressSelect}
										disabled={isSubmitting}
									/>
								</Field>
							)}
						/>

						<form.Field
							name="city"
							children={(field) => {
								const isInvalid = field.state.meta.errors.length > 0;
								return (
									<Field data-invalid={isInvalid}>
										<FieldLabel htmlFor={field.name}>City</FieldLabel>
										<Input
											id={field.name}
											name={field.name}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											aria-invalid={isInvalid}
											autoComplete="address-level2"
											disabled={isSubmitting}
										/>
										{isInvalid && <FieldError errors={field.state.meta.errors} />}
									</Field>
								);
							}}
						/>

						<form.Field
							name="state"
							children={(field) => {
								const isInvalid = field.state.meta.errors.length > 0;
								return (
									<Field data-invalid={isInvalid}>
										<FieldLabel htmlFor={field.name}>State</FieldLabel>
										<Input
											id={field.name}
											name={field.name}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											aria-invalid={isInvalid}
											autoComplete="address-level1"
											disabled={isSubmitting}
										/>
										{isInvalid && <FieldError errors={field.state.meta.errors} />}
									</Field>
								);
							}}
						/>

						<form.Field
							name="zipCode"
							children={(field) => {
								const isInvalid = field.state.meta.errors.length > 0;
								return (
									<Field data-invalid={isInvalid}>
										<FieldLabel htmlFor={field.name}>ZIP code</FieldLabel>
										<Input
											id={field.name}
											name={field.name}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											aria-invalid={isInvalid}
											autoComplete="postal-code"
											disabled={isSubmitting}
										/>
										{isInvalid && <FieldError errors={field.state.meta.errors} />}
									</Field>
								);
							}}
						/>

						<form.Field
							name="propertyType"
							children={(field) => (
								<Field>
									<FieldLabel htmlFor={field.name}>Property type</FieldLabel>
									<Select
										value={field.state.value}
										onValueChange={(value) =>
											field.handleChange(value as PropertyType | null)
										}
										disabled={isSubmitting}
									>
										<SelectTrigger id={field.name}>
											<SelectValue placeholder="Select type" />
										</SelectTrigger>
										<SelectContent>
											{PROPERTY_TYPE_OPTIONS.map((option) => (
												<SelectItem key={option.value} value={option.value}>
													{option.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</Field>
							)}
						/>

						<form.Field
							name="propertyName"
							children={(field) => (
								<Field>
									<FieldLabel htmlFor={field.name}>Property name</FieldLabel>
									<Input
										id={field.name}
										name={field.name}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder="e.g., Main office"
										disabled={isSubmitting}
									/>
								</Field>
							)}
						/>
					</FieldGroup>
				</FieldSet>

				<FieldSet>
					<FieldLegend variant="label">Preferences</FieldLegend>
					<FieldGroup className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
						<form.Field
							name="communicationPreference"
							children={(field) => (
								<Field>
									<FieldLabel>Preferred contact method</FieldLabel>
									<Card className="w-full p-0">
										<RadioGroup
											value={field.state.value}
											onValueChange={(value) =>
												field.handleChange(value as CommunicationPreference)
											}
											disabled={isSubmitting}
										>
											<FieldGroup className="gap-0">
												{COMMUNICATION_OPTIONS.map((option, index) => (
													<React.Fragment key={option.value}>
														{index > 0 ? <Separator /> : null}
														<Field>
															<FieldLabel className="justify-between px-4 py-3">
																<FieldTitle className="flex items-center gap-2">
																	<option.icon
																		aria-hidden="true"
																		className="size-4 opacity-60"
																	/>
																	{option.label}
																</FieldTitle>
																<RadioGroupItem
																	value={option.value}
																	id={`comm-${option.value}`}
																/>
															</FieldLabel>
														</Field>
													</React.Fragment>
												))}
											</FieldGroup>
										</RadioGroup>
									</Card>
								</Field>
							)}
						/>

						<form.Field
							name="tags"
							children={(field) => (
								<Field>
									<FieldLabel>Tags</FieldLabel>
									<TagsInput
										size="sm"
										tags={field.state.value}
										setTags={(action) =>
											field.handleChange(
												typeof action === "function"
													? action(field.state.value)
													: action
											)
										}
										placeholder="Add a tag..."
										disabled={isSubmitting}
									/>
									<FieldDescription>
										Press Enter or comma to add a tag.
									</FieldDescription>
								</Field>
							)}
						/>

						<form.Field
							name="notes"
							children={(field) => (
								<Field className="sm:col-span-2">
									<FieldLabel htmlFor={field.name}>Notes</FieldLabel>
									<Textarea
										id={field.name}
										name={field.name}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										rows={2}
										placeholder="Anything worth remembering about this client"
										disabled={isSubmitting}
									/>
								</Field>
							)}
						/>
					</FieldGroup>
				</FieldSet>
			</div>
		</CreateRecordDialog>
	);
}
