/* eslint-disable react/no-children-prop */
"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm, useStore } from "@tanstack/react-form";
import * as z from "zod/v3";
import { useMutation, useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";

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

type ClientId = Id<"clients">;
type UserId = Id<"users">;

const projectSchema = z.object({
	clientId: z.string().min(1, "Client selection is required"),
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
	const { can, isLoading: permissionsLoading } = usePermissions();

	const canReadClients = can("clients");
	// Skip without the clients grant — the gated endpoint throws FORBIDDEN otherwise.
	const clients = useQuery(api.clients.list, canReadClients ? {} : "skip");
	const users = useQuery(api.users.listByOrg);
	const createProject = useMutation(api.projects.create);

	const form = useForm({
		defaultValues: { ...EMPTY_VALUES, clientId: defaultClientId ?? "" },
		validators: { onSubmit: formSchema },
		onSubmit: async ({ value }) => {
			const title = value.title.trim();
			try {
				const projectId = await createProject({
					clientId: value.clientId as ClientId,
					title,
					description: value.description.trim() || undefined,
					status: "planned",
					projectType: value.projectType,
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
				// Stay put: the dialog exists to preserve the list context. Navigation
				// is offered as a toast action instead (a route change would also
				// dismiss this toast).
				toast.success("Project created", `${title} has been created.`, {
					action: {
						label: "View project",
						onClick: () => router.push(`/projects/${projectId}`),
					},
				});
			} catch (error) {
				console.error("Failed to create project:", error);
				toast.error("Error", "Failed to create project. Please try again.");
			}
		},
	});

	const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

	// Seed only on the false→true transition. A later re-render (defaultClientId
	// changing while open) must not fire a second reset and wipe what the user
	// already typed.
	const wasOpenRef = useRef(false);
	useEffect(() => {
		const isOpening = open && !wasOpenRef.current;
		wasOpenRef.current = open;
		if (!isOpening) return;
		form.reset({ ...EMPTY_VALUES, clientId: defaultClientId ?? "" });
	}, [open, defaultClientId, form]);

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
			description="Set up the project's essentials — you can fill in the rest later."
			submitLabel="Create project"
			isSubmitting={isSubmitting}
			// "The client list settled" — not "the user holds the grant". Without the
			// grant the query is skipped and `clients` stays undefined forever.
			canSubmit={
				!permissionsLoading && (!canReadClients || clients !== undefined)
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
								/>
							</div>
							<FieldDescription>
								Recurring projects repeat on a schedule; one-off projects run once.
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
		</CreateRecordDialog>
	);
}
