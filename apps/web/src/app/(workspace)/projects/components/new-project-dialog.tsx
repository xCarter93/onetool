/* eslint-disable react/no-children-prop */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useStore } from "@tanstack/react-form";
import * as z from "zod/v3";
import { useMutation, useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { PropertyPicker } from "@/components/shared/property-picker";

import { CreateRecordDialog } from "@/components/domain/create-record-dialog";
import { SegmentedControl } from "@/components/domain/segmented-control";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { MultiSelector } from "@/components/shared/multi-selector";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import { localDateToUtcMidnightMs } from "@/lib/dates";
import { useOrgToday } from "@/hooks/use-org-today";
import { convexErrorMessage } from "@/lib/convex-error";
import {
	addCalendarDays,
	listRecurrenceDates,
	validateRecurrenceRule,
} from "@onetool/backend/convex/lib/projectRecurrence";
import {
	RecurrenceScheduleFields,
	initialRecurrenceForm,
} from "./recurrence/schedule-form";
import {
	serializeRecurrenceRule,
	validateRecurrenceForm,
	type RecurrenceFormValue,
} from "./recurrence/rule";

type ClientId = Id<"clients">;
type PropertyId = Id<"clientProperties">;
type UserId = Id<"users">;

const projectSchema = z.object({
	clientId: z.string().min(1, "Client selection is required"),
	propertyId: z.string(),
	title: z.string().trim().min(1, "Project title is required"),
	description: z.string(),
	projectType: z.enum(["one-off", "recurring"]),
	startDate: z.date().optional(),
	endDate: z.date().optional(),
	assignedUserIds: z.array(z.string()),
});

const formSchema = projectSchema.refine(
	(data) => !data.startDate || !data.endDate || data.endDate >= data.startDate,
	{ message: "End date must be on or after start date", path: ["endDate"] }
);

type ProjectFormValues = z.infer<typeof projectSchema>;

const EMPTY_VALUES: ProjectFormValues = {
	clientId: "",
	propertyId: "",
	title: "",
	description: "",
	projectType: "one-off",
	startDate: undefined,
	endDate: undefined,
	assignedUserIds: [],
};

const PROJECT_TYPE_OPTIONS = [
	{ value: "one-off" as const, label: "One-off" },
	{ value: "recurring" as const, label: "Recurring" },
];

interface NewProjectDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onOpenChangeComplete?: (open: boolean) => void;
	/** Seeds the client field when launched from a client record; stays editable. */
	defaultClientId?: ClientId | null;
}

export function NewProjectDialog({
	open,
	onOpenChange,
	onOpenChangeComplete,
	defaultClientId,
}: NewProjectDialogProps) {
	const router = useRouter();
	const toast = useToast();
	const {
		can,
		hasAllRecords,
		isLoading: permissionsLoading,
	} = usePermissions();
	const canCreateSeries =
		can("projects", "modify") && hasAllRecords("projects");
	const today = useOrgToday();
	const [recurrenceDraft, setRecurrenceDraft] =
		useState<RecurrenceFormValue | null>(null);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [previousOpen, setPreviousOpen] = useState(open);
	if (previousOpen !== open) {
		setPreviousOpen(open);
		if (open) {
			setRecurrenceDraft(null);
			setSubmitError(null);
		}
	}

	const canReadClients = can("clients");
	// Skip without the clients grant — the gated endpoint throws FORBIDDEN otherwise.
	const clients = useQuery(
		api.clients.listNamesForOrg,
		canReadClients ? {} : "skip"
	);
	const users = useQuery(api.users.listByOrg);
	const createProject = useMutation(api.projects.create);

	const form = useForm({
		defaultValues: { ...EMPTY_VALUES, clientId: defaultClientId ?? "" },
		validators: { onSubmit: formSchema },
		onSubmit: async ({ value }) => {
			const title = value.title.trim();
			const anchor = value.startDate
				? localDateToUtcMidnightMs(value.startDate)
				: undefined;
			const schedule =
				recurrenceDraft ?? initialRecurrenceForm(anchor ?? today);
			const rule = serializeRecurrenceRule(schedule);
			setSubmitError(null);
			if (value.projectType === "recurring") {
				const error = !canCreateSeries
					? "Organization-wide project access is required to create a recurring series."
					: anchor === undefined
						? "Choose a start date for the recurring schedule."
						: (validateRecurrenceForm(schedule) ??
							validateRecurrenceRule(
								rule,
								new Date(anchor).toISOString().slice(0, 10)
							));
				if (error) {
					setSubmitError(error);
					return;
				}
			}
			try {
				const projectId = await createProject({
					clientId: value.clientId as ClientId,
					propertyId: value.propertyId
						? (value.propertyId as PropertyId)
						: undefined,
					title,
					description: value.description.trim() || undefined,
					status: "planned",
					projectType: value.projectType,
					...(value.projectType === "recurring"
						? { recurrenceRule: rule }
						: {}),
					startDate: value.startDate
						? localDateToUtcMidnightMs(value.startDate)
						: undefined,
					endDate: value.endDate
						? localDateToUtcMidnightMs(value.endDate)
						: undefined,
					assignedUserIds: value.assignedUserIds.length
						? (value.assignedUserIds as UserId[])
						: undefined,
				});
				onOpenChange(false);
				form.reset();
				setRecurrenceDraft(null);
				// Stay put: the dialog exists to preserve the list context. Navigation
				// is offered as a toast action instead (a route change would also
				// dismiss this toast).
				toast.success(
					"Project created",
					value.projectType === "recurring"
						? `${title} and its recurring schedule have been created.`
						: `${title} has been created.`,
					{
						action: {
							label: "View project",
							onClick: () => router.push(`/projects/${projectId}`),
						},
					}
				);
			} catch (error) {
				const message = convexErrorMessage(
					error,
					"Failed to create project. Please try again."
				);
				setSubmitError(message);
				toast.error("Project not created", message);
			}
		},
	});

	const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
	const clientId = useStore(form.store, (state) => state.values.clientId);
	const projectType = useStore(form.store, (state) => state.values.projectType);
	const startDate = useStore(form.store, (state) => state.values.startDate);
	const anchor = startDate ? localDateToUtcMidnightMs(startDate) : undefined;
	const recurrenceValue = useMemo(
		() => recurrenceDraft ?? initialRecurrenceForm(anchor ?? today),
		[recurrenceDraft, anchor, today]
	);
	const recurrenceRule = useMemo(
		() => serializeRecurrenceRule(recurrenceValue),
		[recurrenceValue]
	);
	const recurrenceError = !canCreateSeries
		? "Organization-wide project access is required to create a recurring series."
		: anchor === undefined
			? "Choose a start date for the recurring schedule."
			: (validateRecurrenceForm(recurrenceValue) ??
				validateRecurrenceRule(
					recurrenceRule,
					new Date(anchor).toISOString().slice(0, 10)
				));
	const recurrencePreview = useMemo(() => {
		if (projectType !== "recurring" || recurrenceError || anchor === undefined)
			return { dates: [], error: null };
		try {
			const anchorKey = new Date(anchor).toISOString().slice(0, 10);
			const todayKey = new Date(today).toISOString().slice(0, 10);
			const afterOrigin = addCalendarDays(anchorKey, 1);
			const from = todayKey > afterOrigin ? todayKey : afterOrigin;
			const horizon = addCalendarDays(todayKey, 90);
			const dates = [
				...new Set([
					anchorKey,
					...listRecurrenceDates({
						rule: recurrenceRule,
						anchor: anchorKey,
						from,
						through: from > horizon ? from : horizon,
						limit: 8,
						includeNext: true,
					}),
				]),
			].slice(0, 8);
			return { dates, error: null };
		} catch (error) {
			return {
				dates: [],
				error:
					error instanceof Error
						? error.message
						: "Choose another schedule to preview visits.",
			};
		}
	}, [projectType, recurrenceError, anchor, today, recurrenceRule]);

	// Skip without the clients grant, dialog closed, or no client picked yet.
	const properties = useQuery(
		api.clientProperties.listByClient,
		open && canReadClients && clientId
			? { clientId: clientId as ClientId }
			: "skip"
	);

	// Seed only on the false→true transition. A later re-render (defaultClientId
	// changing while open) must not fire a second reset and wipe what the user
	// already typed.
	const wasOpenRef = useRef(false);
	// Tracks the client the property default was last computed for, so a fresh
	// properties fetch for the same client (e.g. Convex refetch) doesn't clobber
	// a manual property selection.
	const propertyDefaultedForClientRef = useRef<string | undefined>(undefined);
	useEffect(() => {
		const isOpening = open && !wasOpenRef.current;
		wasOpenRef.current = open;
		if (!isOpening) return;
		propertyDefaultedForClientRef.current = undefined;
		form.reset({ ...EMPTY_VALUES, clientId: defaultClientId ?? "" });
	}, [open, defaultClientId, form]);

	useEffect(() => {
		if (!properties || propertyDefaultedForClientRef.current === clientId)
			return;
		propertyDefaultedForClientRef.current = clientId;
		const primary = properties.find((property) => property.isPrimary);
		const defaultProperty =
			primary ?? (properties.length === 1 ? properties[0] : undefined);
		form.setFieldValue("propertyId", defaultProperty?._id ?? "");
	}, [clientId, properties, form]);

	const userOptions = useMemo(
		() =>
			(users ?? []).map((user) => ({
				label: user.name || user.email,
				value: user._id,
			})),
		[users]
	);

	return (
		<CreateRecordDialog
			open={open}
			onOpenChange={onOpenChange}
			onOpenChangeComplete={onOpenChangeComplete}
			title="New project"
			description="Set up the project's essentials. You can fill in the rest later."
			submitLabel="Create project"
			isSubmitting={isSubmitting}
			// "The client list settled" — not "the user holds the grant". Without the
			// grant the query is skipped and `clients` stays undefined forever.
			canSubmit={
				!permissionsLoading &&
				(!canReadClients || clients !== undefined) &&
				(projectType !== "recurring" ||
					(!recurrenceError && !recurrencePreview.error))
			}
			onSubmit={() => form.handleSubmit()}
		>
			<FieldGroup className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
				<form.Field
					name="clientId"
					validators={{ onChange: projectSchema.shape.clientId }}
					children={(field) => {
						const isInvalid = field.state.meta.errors.length > 0;
						const clientsLocked = !permissionsLoading && !canReadClients;
						return (
							<Field data-invalid={isInvalid}>
								<FieldLabel htmlFor={field.name}>Client *</FieldLabel>
								{clientsLocked ? (
									<FieldDescription>
										You don&apos;t have permission to view clients. Ask an admin
										for client access to create a project.
									</FieldDescription>
								) : (
									<Select
										value={field.state.value}
										onValueChange={(value) =>
											field.handleChange(value as string)
										}
										disabled={isSubmitting}
									>
										<SelectTrigger id={field.name} aria-invalid={isInvalid}>
											<SelectValue placeholder="Select a client" />
										</SelectTrigger>
										<SelectContent>
											{(clients ?? []).map((client) => (
												<SelectItem key={client._id} value={client._id}>
													{client.companyName}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								)}
								{isInvalid && <FieldError errors={field.state.meta.errors} />}
							</Field>
						);
					}}
				/>

				{clientId && properties && properties.length > 0 && (
					<form.Field
						name="propertyId"
						children={(field) => (
							<Field className="sm:col-span-2">
								<FieldLabel htmlFor={field.name}>Property</FieldLabel>
								<PropertyPicker
									properties={properties}
									value={field.state.value as Id<"clientProperties"> | ""}
									onChange={(id) => field.handleChange(id)}
									disabled={isSubmitting}
								/>
							</Field>
						)}
					/>
				)}

				<form.Field
					name="title"
					validators={{ onChange: projectSchema.shape.title }}
					children={(field) => {
						const isInvalid = field.state.meta.errors.length > 0;
						return (
							<Field data-invalid={isInvalid}>
								<FieldLabel htmlFor={field.name}>Project title *</FieldLabel>
								<Input
									id={field.name}
									name={field.name}
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									aria-invalid={isInvalid}
									placeholder="e.g., Spring gutter cleaning"
									disabled={isSubmitting}
								/>
								{isInvalid && <FieldError errors={field.state.meta.errors} />}
							</Field>
						);
					}}
				/>

				<form.Field
					name="description"
					children={(field) => (
						<Field className="sm:col-span-2">
							<FieldLabel htmlFor={field.name}>Description</FieldLabel>
							<Textarea
								id={field.name}
								name={field.name}
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								rows={3}
								placeholder="Describe the work and any context the crew needs"
								disabled={isSubmitting}
							/>
						</Field>
					)}
				/>

				<form.Field
					name="projectType"
					children={(field) => (
						<Field className="sm:col-span-2">
							<FieldLabel>Project type</FieldLabel>
							{/* Field's vertical variant forces *:w-full on direct children, which
							    stretches the pill track; the wrapper absorbs it so the control hugs. */}
							<div>
								<SegmentedControl
									value={field.state.value}
									onValueChange={field.handleChange}
									options={PROJECT_TYPE_OPTIONS}
									disabled={isSubmitting}
								/>
							</div>
							<FieldDescription>
								Recurring projects repeat on a schedule; one-off projects run
								once.
							</FieldDescription>
						</Field>
					)}
				/>

				<form.Field
					name="startDate"
					children={(field) => (
						<Field>
							<FieldLabel htmlFor={field.name}>Start date</FieldLabel>
							<DatePicker
								id={field.name}
								value={field.state.value}
								onChange={field.handleChange}
								placeholder="Select start date"
								disabled={isSubmitting}
							/>
						</Field>
					)}
				/>

				<form.Subscribe selector={(state) => state.values.startDate}>
					{(startDate) => (
						<form.Field
							name="endDate"
							children={(field) => {
								const isInvalid = field.state.meta.errors.length > 0;
								return (
									<Field data-invalid={isInvalid}>
										<FieldLabel htmlFor={field.name}>End date</FieldLabel>
										<DatePicker
											id={field.name}
											value={field.state.value}
											onChange={field.handleChange}
											placeholder="Select end date"
											disabled={isSubmitting}
											disabledDates={
												startDate ? { before: startDate as Date } : undefined
											}
										/>
										{isInvalid && (
											<FieldError errors={field.state.meta.errors} />
										)}
									</Field>
								);
							}}
						/>
					)}
				</form.Subscribe>

				{projectType === "recurring" && (
					<div className="space-y-3 border-t border-border pt-5 sm:col-span-2">
						<h3 className="text-sm font-semibold">Recurring schedule</h3>
						<p className="text-sm text-muted-foreground">
							Start and end dates describe the first visit. Choose when the
							series repeats and ends below.
						</p>
						<RecurrenceScheduleFields
							value={recurrenceValue}
							onChange={setRecurrenceDraft}
							error={recurrenceError ?? recurrencePreview.error}
							preview={recurrencePreview.dates}
							disabled={isSubmitting || !canCreateSeries}
						/>
					</div>
				)}

				<form.Field
					name="assignedUserIds"
					children={(field) => (
						<Field className="sm:col-span-2">
							{/* No htmlFor: MultiSelector renders no element with this id. */}
							<FieldLabel>Assign to</FieldLabel>
							<MultiSelector
								options={userOptions}
								value={field.state.value}
								onValueChange={field.handleChange}
								placeholder="Select team members"
								maxCount={2}
								disabled={isSubmitting}
								className="w-full"
							/>
						</Field>
					)}
				/>
			</FieldGroup>
			{submitError &&
				submitError !== recurrenceError &&
				submitError !== recurrencePreview.error && (
					<p role="alert" className="text-sm text-danger">
						{submitError}
					</p>
				)}
		</CreateRecordDialog>
	);
}
