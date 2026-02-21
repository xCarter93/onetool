/* eslint-disable react/no-children-prop */
"use client";

import React, { useEffect, useMemo } from "react";
import { useForm } from "@tanstack/react-form";
import * as z from 'zod/v3';
import { useToastOperations } from "@/hooks/use-toast";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { CalendarWidget } from "@/components/ui/calendar-widget";
import { StickyFormFooter } from "@/components/shared/sticky-form-footer";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { useRouter } from "next/navigation";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { ButtonGroup } from "@/components/ui/button-group";
import { cn } from "@/lib/utils";
import { StyledMultiSelector } from "@/components/ui/styled/styled-multi-selector";
import { User } from "lucide-react";
import { ProjectCreationSidebar } from "./project-creation-sidebar";

type ClientId = Id<"clients">;
type ClientContactId = Id<"clientContacts">;
type ClientPropertyId = Id<"clientProperties">;
type UserId = Id<"users">;

export interface ProjectFormData {
	clientId: string;
	title: string;
	description: string;
	projectType: "one-off" | "recurring";
	startDate: Date | undefined;
	endDate: Date | undefined;
	startTime: string;
	endTime: string;
	assignedUserIds: string[];
}

interface ProjectOnboardingFormProps {
	preselectedClientId?: ClientId | null;
	onSubmit?: (data: ProjectFormData) => void;
	isLoading?: boolean;
}

const initialFormData: ProjectFormData = {
	clientId: "",
	title: "",
	description: "",
	projectType: "one-off",
	startDate: undefined,
	endDate: undefined,
	startTime: "",
	endTime: "",
	assignedUserIds: [],
};

const formSchema = z
	.object({
		clientId: z.string().min(1, "Client selection is required"),
		title: z.string().min(1, "Project title is required"),
		description: z.string(),
		projectType: z.enum(["one-off", "recurring"]),
		startDate: z.date().optional(),
		endDate: z.date().optional(),
		startTime: z.string(),
		endTime: z.string(),
		assignedUserIds: z.array(z.string()),
	})
	.refine(
		(data) => {
			if (data.startDate && data.endDate) {
				return data.endDate >= data.startDate;
			}
			return true;
		},
		{
			message: "End date must be on or after start date",
			path: ["endDate"],
		}
	);

const formatDisplayDate = (date?: Date | number) => {
	if (!date) return "Not set";
	const dateObj = typeof date === "number" ? new Date(date) : date;
	return dateObj.toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
};

const getPropertyDisplayName = (property: {
	propertyName?: string;
	streetAddress: string;
}) =>
	property.propertyName
		? `${property.propertyName} - ${property.streetAddress}`
		: property.streetAddress;

const getContactDisplayName = (contact: {
	firstName: string;
	lastName: string;
	jobTitle?: string;
}) =>
	`${contact.firstName} ${contact.lastName}${contact.jobTitle ? ` - ${contact.jobTitle}` : ""}`;

// Separate component for date fields to handle state properly
function DateFieldsSection({
	form,
	isLoading,
}: {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	form: any;
	isLoading: boolean;
}) {
	const [startDateOpen, setStartDateOpen] = React.useState(false);
	const [endDateOpen, setEndDateOpen] = React.useState(false);

	return (
		<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
			<form.Field
				name="startDate"
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				children={(field: any) => (
					<Field>
						<FieldLabel>Start Date</FieldLabel>
						<Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
							<PopoverTrigger asChild>
								<Button
									intent="outline"
									className="w-full justify-start text-left font-normal"
								>
									<CalendarIcon className="mr-2 h-4 w-4" />
									{field.state.value
										? formatDisplayDate(field.state.value)
										: "Select start date"}
								</Button>
							</PopoverTrigger>
							<PopoverContent
								className="w-auto p-0 bg-white dark:bg-gray-950"
								align="start"
							>
								<Calendar
									mode="single"
									selected={field.state.value}
									onSelect={(date) => {
										field.handleChange(date);
										setStartDateOpen(false);
									}}
									disabled={isLoading}
									className="!bg-white dark:!bg-gray-950"
								/>
							</PopoverContent>
						</Popover>
					</Field>
				)}
			/>
			<form.Field
				name="endDate"
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				children={(field: any) => {
					const startDateValue = form.getFieldValue("startDate");
					return (
						<Field>
							<FieldLabel>End Date</FieldLabel>
							<Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
								<PopoverTrigger asChild>
									<Button
										intent="outline"
										className="w-full justify-start text-left font-normal"
									>
										<CalendarIcon className="mr-2 h-4 w-4" />
										{field.state.value
											? formatDisplayDate(field.state.value)
											: "Select end date"}
									</Button>
								</PopoverTrigger>
								<PopoverContent
									className="w-auto p-0 bg-white dark:bg-gray-950"
									align="start"
								>
									<Calendar
										mode="single"
										selected={field.state.value}
										onSelect={(date) => {
											field.handleChange(date);
											setEndDateOpen(false);
										}}
										disabled={(date) => {
											if (isLoading) return true;
											if (!startDateValue) return false;
											const start =
												typeof startDateValue === "number"
													? new Date(startDateValue)
													: new Date(startDateValue.getTime());
											start.setHours(0, 0, 0, 0);
											const checkDate = new Date(date);
											checkDate.setHours(0, 0, 0, 0);
											return checkDate < start;
										}}
										className="!bg-white dark:!bg-gray-950"
									/>
								</PopoverContent>
							</Popover>
						</Field>
					);
				}}
			/>
		</div>
	);
}

export function ProjectOnboardingForm({
	preselectedClientId,
	onSubmit,
	isLoading = false,
}: ProjectOnboardingFormProps) {
	const router = useRouter();
	const toast = useToastOperations();

	const [selectedClientId, setSelectedClientId] =
		React.useState<ClientId | null>(preselectedClientId || null);
	const [selectedPropertyId, setSelectedPropertyId] =
		React.useState<ClientPropertyId | null>(null);
	const [selectedContactId, setSelectedContactId] =
		React.useState<ClientContactId | null>(null);

	const [calendarDate, setCalendarDate] = React.useState(() => {
		const date = new Date();
		date.setHours(0, 0, 0, 0);
		return date;
	});

	const [projectType, setProjectType] = React.useState<"one-off" | "recurring">(
		"one-off"
	);

	const clientsResult = useQuery(api.clients.list, {});
	const clients = useMemo(() => clientsResult ?? [], [clientsResult]);
	const clientDetails = useQuery(
		api.clients.get,
		selectedClientId ? { id: selectedClientId } : "skip"
	);

	const clientContacts = useQuery(
		api.clientContacts.listByClient,
		selectedClientId ? { clientId: selectedClientId } : "skip"
	);
	const clientProperties = useQuery(
		api.clientProperties.listByClient,
		selectedClientId ? { clientId: selectedClientId } : "skip"
	);

	const users = useQuery(api.users.listByOrg);

	const createProject = useMutation(api.projects.create);

	const form = useForm({
		defaultValues: {
			...initialFormData,
			clientId: preselectedClientId || "",
		},
		onSubmit: async ({ value }) => {
			const result = formSchema.safeParse(value);
			if (!result.success) {
				const errors = result.error.flatten();
				console.error("Validation errors:", errors);
				toast.error(
					"Validation Error",
					"Please fix the errors in the form before submitting."
				);
				return;
			}

			try {
				const payload = {
					clientId: value.clientId as ClientId,
					title: value.title.trim(),
					description: value.description || undefined,
					status: "planned" as const,
					projectType: value.projectType,
					startDate: value.startDate ? value.startDate.getTime() : undefined,
					endDate: value.endDate ? value.endDate.getTime() : undefined,
					assignedUserIds:
						value.assignedUserIds.length > 0
							? (value.assignedUserIds as UserId[])
							: undefined,
				};

				if (onSubmit) {
					onSubmit(value);
				} else {
					const projectId = await createProject(payload);
					toast.success(
						"Project Created",
						"Project has been successfully created!"
					);
					router.push(`/projects/${projectId}`);
				}
			} catch (error) {
				console.error("Failed to submit form:", error);
				toast.error("Error", "Failed to create project. Please try again.");
			}
		},
	});

	useEffect(() => {
		if (preselectedClientId) {
			setSelectedClientId(preselectedClientId);
			form.setFieldValue("clientId", preselectedClientId);
		}
	}, [preselectedClientId, form]);

	useEffect(() => {
		setSelectedPropertyId(null);
		setSelectedContactId(null);
	}, [selectedClientId]);

	useEffect(() => {
		if (!clientProperties) return;
		setSelectedPropertyId((current) => {
			if (
				current &&
				clientProperties.some((property) => property._id === current)
			) {
				return current;
			}
			const primary =
				clientProperties.find((property) => property.isPrimary) ??
				clientProperties[0] ??
				null;
			return primary ? primary._id : null;
		});
	}, [clientProperties]);

	useEffect(() => {
		if (!clientContacts) return;
		setSelectedContactId((current) => {
			if (
				current &&
				clientContacts.some((contact) => contact._id === current)
			) {
				return current;
			}
			const primary =
				clientContacts.find((contact) => contact.isPrimary) ??
				clientContacts[0] ??
				null;
			return primary ? primary._id : null;
		});
	}, [clientContacts]);

	const selectedClient = useMemo(() => {
		if (!selectedClientId) return null;
		return clients.find((client) => client._id === selectedClientId) ?? null;
	}, [clients, selectedClientId]);

	const propertyOptions = useMemo(
		() =>
			clientProperties?.map((property) => getPropertyDisplayName(property)) ??
			[],
		[clientProperties]
	);

	const contactOptions = useMemo(
		() =>
			clientContacts?.map((contact) => getContactDisplayName(contact)) ?? [],
		[clientContacts]
	);

	const selectedProperty = useMemo(() => {
		if (!clientProperties || !selectedPropertyId) return null;
		return (
			clientProperties.find(
				(property) => property._id === selectedPropertyId
			) ?? null
		);
	}, [clientProperties, selectedPropertyId]);

	const selectedContact = useMemo(() => {
		if (!clientContacts || !selectedContactId) return null;
		return (
			clientContacts.find((contact) => contact._id === selectedContactId) ??
			null
		);
	}, [clientContacts, selectedContactId]);

	const clientOptions = useMemo(
		() => clients.map((client) => client.companyName),
		[clients]
	);

	const handleClientSelect = (selection: string | null) => {
		if (!selection) {
			setSelectedClientId(null);
			form.setFieldValue("clientId", "");
			return;
		}
		const client = clients.find((item) => item.companyName === selection);
		if (client) {
			setSelectedClientId(client._id);
			form.setFieldValue("clientId", client._id);
		}
	};

	const handlePropertySelect = (selection: string | null) => {
		if (!clientProperties) return;
		if (!selection) {
			setSelectedPropertyId(null);
			return;
		}
		const property = clientProperties.find(
			(item) => getPropertyDisplayName(item) === selection
		);
		if (property) {
			setSelectedPropertyId(property._id);
		}
	};

	const handleContactSelect = (selection: string | null) => {
		if (!clientContacts) return;
		if (!selection) {
			setSelectedContactId(null);
			return;
		}
		const contact = clientContacts.find(
			(item) => getContactDisplayName(item) === selection
		);
		if (contact) {
			setSelectedContactId(contact._id);
		}
	};

	const handleProjectTypeChange = (type: "one-off" | "recurring") => {
		setProjectType(type);
		form.setFieldValue("projectType", type);
	};

	const handleCalendarNavigation = (direction: "prev" | "next") => {
		setCalendarDate((previous) => {
			const nextDate = new Date(previous);
			nextDate.setMonth(
				direction === "prev" ? nextDate.getMonth() - 1 : nextDate.getMonth() + 1
			);
			return nextDate;
		});
	};

	const handleDateClick = (day: number | null) => {
		if (!day) return;
		const clickedDate = new Date(
			calendarDate.getFullYear(),
			calendarDate.getMonth(),
			day
		);
		clickedDate.setHours(0, 0, 0, 0);

		const currentStartDate = form.getFieldValue("startDate");
		const currentEndDate = form.getFieldValue("endDate");

		if (!currentStartDate) {
			form.setFieldValue("startDate", clickedDate);
			return;
		}

		if (!currentEndDate) {
			const startNormalized = new Date(
				typeof currentStartDate === "number"
					? currentStartDate
					: currentStartDate.getTime()
			);
			startNormalized.setHours(0, 0, 0, 0);

			if (clickedDate < startNormalized) {
				form.setFieldValue("startDate", clickedDate);
				form.setFieldValue("endDate", undefined);
				toast.error(
					"Invalid Date Selection",
					"End date cannot be before start date. Resetting to new start date."
				);
				return;
			}

			form.setFieldValue("endDate", clickedDate);
			return;
		}

		form.setFieldValue("startDate", clickedDate);
		form.setFieldValue("endDate", undefined);
	};

	return (
		<>
			<div className="relative min-h-screen p-6 pb-0">
				{/* Header */}
				<div className="border-b border-border pb-4 mb-0">
					<h1 className="text-2xl font-bold text-foreground">
						Create New Project
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Set up your project with all the essential details for successful execution.
					</p>
				</div>

				{/* Two-column layout: form on left, sidebar on right */}
				<div className="flex gap-0">
					{/* Left: Form content */}
					<div className="flex-1 min-w-0 pr-6 pt-6 pb-20">
						<form
							id="project-onboarding-form"
							onSubmit={(e) => {
								e.preventDefault();
								form.handleSubmit();
							}}
							className="space-y-8"
						>
							{/* Project Title */}
							<FieldGroup>
								<form.Field
									name="title"
									children={(field) => {
										const isInvalid =
											field.state.meta.isTouched &&
											field.state.meta.errors.length > 0;
										return (
											<Field data-invalid={isInvalid}>
												<FieldLabel htmlFor={field.name}>
													Project Title *
												</FieldLabel>
												<Input
													id={field.name}
													name={field.name}
													value={field.state.value}
													onBlur={field.handleBlur}
													onChange={(e) =>
														field.handleChange(e.target.value)
													}
													aria-invalid={isInvalid}
													placeholder="e.g., Workshop & Festival"
													disabled={isLoading}
												/>
												{isInvalid && (
													<FieldError errors={field.state.meta.errors} />
												)}
											</Field>
										);
									}}
								/>
							</FieldGroup>

							{/* Description */}
							<FieldGroup>
								<form.Field
									name="description"
									children={(field) => {
										const isInvalid =
											field.state.meta.isTouched &&
											field.state.meta.errors.length > 0;
										return (
											<Field data-invalid={isInvalid}>
												<FieldLabel htmlFor={field.name}>
													Description
												</FieldLabel>
												<Textarea
													id={field.name}
													name={field.name}
													value={field.state.value}
													onBlur={field.handleBlur}
													onChange={(e) =>
														field.handleChange(e.target.value)
													}
													aria-invalid={isInvalid}
													rows={4}
													placeholder="Describe the project details and context"
													disabled={isLoading}
												/>
												{isInvalid && (
													<FieldError errors={field.state.meta.errors} />
												)}
											</Field>
										);
									}}
								/>
							</FieldGroup>

							{/* Assigned Users */}
							<FieldGroup>
								<form.Field
									name="assignedUserIds"
									children={(field) => {
										const currentValues = (field.state.value ||
											[]) as string[];

										return (
											<Field>
												<FieldLabel
													htmlFor={field.name}
													className="flex items-center gap-2"
												>
													<User className="h-4 w-4 text-primary" />
													Assign To
												</FieldLabel>
												<StyledMultiSelector
													options={
														users?.map((user) => ({
															label: user.name || user.email,
															value: user._id,
														})) || []
													}
													value={currentValues}
													onValueChange={(values) =>
														field.handleChange(values as UserId[])
													}
													placeholder="Select team members"
													maxCount={2}
													disabled={isLoading}
													className="w-full"
												/>
											</Field>
										);
									}}
								/>
							</FieldGroup>

							{/* Schedule Section */}
							<div className="space-y-6 border-t border-border pt-6">
								<div className="flex items-center gap-2 mb-2">
									<CalendarIcon className="h-5 w-5 text-muted-foreground" />
									<h3 className="text-sm font-medium text-foreground">
										Schedule & Project Details
									</h3>
								</div>

								{/* Project Type */}
								<div>
									<label className="block text-sm font-medium text-foreground mb-3">
										Project Type
									</label>
									<ButtonGroup>
										<button
											type="button"
											onClick={() => handleProjectTypeChange("one-off")}
											className={cn(
												"inline-flex items-center gap-2 font-semibold transition-all duration-200 text-xs px-3 py-1.5 ring-1 shadow-sm hover:shadow-md backdrop-blur-sm",
												projectType === "one-off"
													? "text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/15 ring-primary/30 hover:ring-primary/40"
													: "text-gray-600 hover:text-gray-700 bg-transparent hover:bg-gray-50 ring-transparent hover:ring-gray-200 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-800 dark:hover:ring-gray-700"
											)}
										>
											One-off Project
										</button>
										<button
											type="button"
											onClick={() => handleProjectTypeChange("recurring")}
											className={cn(
												"inline-flex items-center gap-2 font-semibold transition-all duration-200 text-xs px-3 py-1.5 ring-1 shadow-sm hover:shadow-md backdrop-blur-sm",
												projectType === "recurring"
													? "text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/15 ring-primary/30 hover:ring-primary/40"
													: "text-gray-600 hover:text-gray-700 bg-transparent hover:bg-gray-50 ring-transparent hover:ring-gray-200 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-800 dark:hover:ring-gray-700"
											)}
										>
											Recurring Project
										</button>
									</ButtonGroup>
								</div>

								<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
									<div className="space-y-6">
										<DateFieldsSection form={form} isLoading={isLoading} />

										{/* Time inputs for recurring projects */}
										<form.Field
											name="projectType"
											children={(typeField) =>
												typeField.state.value === "recurring" && (
													<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
														<form.Field
															name="startTime"
															children={(field) => (
																<Field>
																	<FieldLabel htmlFor={field.name}>
																		Start Time
																	</FieldLabel>
																	<Input
																		id={field.name}
																		type="time"
																		value={field.state.value}
																		onChange={(e) =>
																			field.handleChange(e.target.value)
																		}
																		disabled={isLoading}
																	/>
																</Field>
															)}
														/>
														<form.Field
															name="endTime"
															children={(field) => (
																<Field>
																	<FieldLabel htmlFor={field.name}>
																		End Time
																	</FieldLabel>
																	<Input
																		id={field.name}
																		type="time"
																		value={field.state.value}
																		onChange={(e) =>
																			field.handleChange(e.target.value)
																		}
																		disabled={isLoading}
																	/>
																</Field>
															)}
														/>
													</div>
												)
											}
										/>
									</div>

									<CalendarWidget
										form={form}
										calendarDate={calendarDate}
										handleCalendarNavigation={handleCalendarNavigation}
										handleDateClick={handleDateClick}
										formatDisplayDate={formatDisplayDate}
										variant="default"
									/>
								</div>
							</div>
						</form>
					</div>

					{/* Right: Persistent sidebar (desktop) */}
					<div className="hidden xl:block w-[480px] shrink-0 border-l border-border/80 min-h-screen bg-muted/20">
						<div className="sticky top-24">
							<ProjectCreationSidebar
								clientOptions={clientOptions}
								selectedClient={selectedClient}
								clientDetails={clientDetails}
								selectedClientId={selectedClientId}
								onClientSelect={handleClientSelect}
								isLoading={isLoading}
								propertyOptions={propertyOptions}
								selectedProperty={selectedProperty}
								onPropertySelect={handlePropertySelect}
								contactOptions={contactOptions}
								selectedContact={selectedContact}
								onContactSelect={handleContactSelect}
							/>
						</div>
					</div>
				</div>

				{/* Sidebar for mobile (below form) */}
				<div className="xl:hidden mt-6 border-t-2 border-border/80 pt-6 bg-muted/20 rounded-lg">
					<ProjectCreationSidebar
						clientOptions={clientOptions}
						selectedClient={selectedClient}
						clientDetails={clientDetails}
						selectedClientId={selectedClientId}
						onClientSelect={handleClientSelect}
						isLoading={isLoading}
						propertyOptions={propertyOptions}
						selectedProperty={selectedProperty}
						onPropertySelect={handlePropertySelect}
						contactOptions={contactOptions}
						selectedContact={selectedContact}
						onContactSelect={handleContactSelect}
					/>
				</div>
			</div>
			<StickyFormFooter
				buttons={[
					{
						label: isLoading ? "Creating..." : "Create Project",
						onClick: () => form.handleSubmit(),
						intent: "primary",
						isLoading,
						position: "left",
					},
				]}
			/>
		</>
	);
}

ProjectOnboardingForm.displayName = "ProjectOnboardingForm";
