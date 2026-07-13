"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, useStore } from "@tanstack/react-form";
import * as z from "zod/v3";
import { useMutation, useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";

import { CreateRecordDialog } from "@/components/domain/create-record-dialog";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";

const DEFAULT_TERMS = "Payment due within 30 days of acceptance";

interface NewQuoteFormData {
	clientId: string;
	projectId: string;
	title: string;
	validUntil: Date | undefined;
	clientMessage: string;
	terms: string;
}

const formSchema = z.object({
	clientId: z.string().min(1, "Client is required"),
	projectId: z.string(),
	title: z.string(),
	validUntil: z.date().optional(),
	clientMessage: z.string(),
	terms: z.string(),
});

const emptyValues: NewQuoteFormData = {
	clientId: "",
	projectId: "",
	title: "",
	validUntil: undefined,
	clientMessage: "",
	terms: DEFAULT_TERMS,
};

// The backend rejects `validUntil <= Date.now()`, and the picker returns LOCAL
// midnight for the chosen day — so today's own date is always in the past.
function startOfTomorrow(): Date {
	const date = new Date();
	date.setHours(0, 0, 0, 0);
	date.setDate(date.getDate() + 1);
	return date;
}

interface NewQuoteDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	defaultClientId?: Id<"clients"> | null;
	defaultProjectId?: Id<"projects"> | null;
}

export function NewQuoteDialog({
	open,
	onOpenChange,
	defaultClientId,
	defaultProjectId,
}: NewQuoteDialogProps) {
	const router = useRouter();
	const toast = useToast();
	const { can, isLoading: permissionsLoading } = usePermissions();

	const canReadClients = can("clients");
	const canReadProjects = can("projects");

	// Gated reads — skip without the grant to avoid a FORBIDDEN crash. A skipped
	// query stays `undefined` forever, so "loading" must be grant-aware.
	const clients = useQuery(api.clients.list, canReadClients ? {} : "skip");
	const defaultProject = useQuery(
		api.projects.get,
		defaultProjectId && canReadProjects ? { id: defaultProjectId } : "skip"
	);

	const createQuote = useMutation(api.quotes.create);

	const form = useForm({
		defaultValues: emptyValues,
		onSubmit: async ({ value }) => {
			const parsed = formSchema.safeParse(value);
			if (!parsed.success) {
				toast.error(
					"Missing Client",
					"Please select a client before creating the quote."
				);
				return;
			}

			try {
				const quoteId = await createQuote({
					clientId: value.clientId as Id<"clients">,
					projectId: value.projectId
						? (value.projectId as Id<"projects">)
						: undefined,
					title: value.title.trim() || undefined,
					status: "draft",
					subtotal: 0, // Line items are added in the line editor.
					total: 0,
					validUntil: value.validUntil ? value.validUntil.getTime() : undefined,
					clientMessage: value.clientMessage.trim() || undefined,
					terms: value.terms.trim() || undefined,
					pdfSettings: {
						showQuantities: true,
						showUnitPrices: true,
						showLineItemTotals: true,
						showTotals: true,
					},
				});

				// No success toast: ToastProvider drops transient toasts on route
				// change, and the line editor is the rest of this creation flow.
				onOpenChange(false);
				form.reset();
				router.push(`/quotes/${quoteId}/quoteLineEditor`);
			} catch (error) {
				console.error("Failed to create quote:", error);
				toast.error("Error", "Failed to create quote. Please try again.");
			}
		},
	});

	const selectedClientId = useStore(form.store, (state) => state.values.clientId);
	const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

	const projects = useQuery(
		api.projects.list,
		selectedClientId && canReadProjects
			? { clientId: selectedClientId as Id<"clients"> }
			: "skip"
	);

	const clientOptions = React.useMemo(() => clients ?? [], [clients]);
	const projectOptions = React.useMemo(() => projects ?? [], [projects]);

	const prefillClientId = defaultClientId ?? defaultProject?.clientId ?? "";
	const prefillProjectId = defaultProjectId ?? "";

	// Once the user picks a value, the launch-context prefill must never
	// overwrite it (the project's client resolves async, after the dialog opens).
	const previousOpenRef = React.useRef(open);
	const clientDirtyRef = React.useRef(false);
	const projectDirtyRef = React.useRef(false);

	// Seed ONLY on the false→true open transition. Async prefills land on their
	// own field below — a second form.reset() would wipe what the user typed.
	React.useEffect(() => {
		const justOpened = open && !previousOpenRef.current;
		previousOpenRef.current = open;
		if (!justOpened) return;
		clientDirtyRef.current = false;
		projectDirtyRef.current = false;
		form.reset({ ...emptyValues });
	}, [open, form]);

	// A Select can't label a value whose option hasn't loaded — it stringifies the
	// raw id into the trigger. So only adopt a prefill once its option exists.
	React.useEffect(() => {
		if (!open || clientDirtyRef.current || !prefillClientId) return;
		if (form.getFieldValue("clientId")) return;
		if (!clientOptions.some((client) => client._id === prefillClientId)) return;
		form.setFieldValue("clientId", prefillClientId);
	}, [open, prefillClientId, clientOptions, form]);

	React.useEffect(() => {
		if (!open || projectDirtyRef.current || !prefillProjectId) return;
		if (form.getFieldValue("projectId")) return;
		if (!projectOptions.some((project) => project._id === prefillProjectId))
			return;
		form.setFieldValue("projectId", prefillProjectId);
	}, [open, prefillProjectId, projectOptions, form]);

	const clientsLoading = canReadClients && clients === undefined;
	const projectsLoading =
		canReadProjects && !!selectedClientId && projects === undefined;

	return (
		<CreateRecordDialog
			open={open}
			onOpenChange={onOpenChange}
			title="New quote"
			description="Pick the client and add the basics. Line items come next."
			submitLabel="Create quote"
			isSubmitting={isSubmitting}
			canSubmit={!permissionsLoading && !clientsLoading}
			onSubmit={() => form.handleSubmit()}
		>
			<FieldGroup className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
				<form.Field
					name="clientId"
					validators={{
						onChange: ({ value }: { value: string }) =>
							value ? undefined : { message: "Client is required" },
					}}
				>
					{(field) => {
						const isInvalid =
							field.state.meta.isTouched && field.state.meta.errors.length > 0;
						// Never hand the Select a value it has no option for.
						const selectValue = clientOptions.some(
							(client) => client._id === field.state.value
						)
							? field.state.value
							: "";
						return (
							<Field data-invalid={isInvalid}>
								<FieldLabel htmlFor={field.name}>Client *</FieldLabel>
								<Select
									value={selectValue}
									onValueChange={(value: string | null) => {
										clientDirtyRef.current = true;
										// A manual client change invalidates any project prefill.
										projectDirtyRef.current = true;
										field.handleChange(value ?? "");
										// Projects are client-scoped — a new client invalidates the pick.
										form.setFieldValue("projectId", "");
									}}
									disabled={isSubmitting || !canReadClients || clientsLoading}
								>
									<SelectTrigger
										id={field.name}
										className="w-full"
										aria-invalid={isInvalid}
										onBlur={field.handleBlur}
									>
										<SelectValue
											placeholder={
												!canReadClients
													? "No access to clients"
													: clientsLoading
														? "Loading clients…"
														: "Select a client"
											}
										/>
									</SelectTrigger>
									<SelectContent>
										{clientOptions.map((client) => (
											<SelectItem key={client._id} value={client._id}>
												{client.companyName}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								{!permissionsLoading && !canReadClients && (
									<FieldDescription>
										You don&apos;t have permission to view clients, so a quote
										can&apos;t be created here. Ask an admin for Clients access.
									</FieldDescription>
								)}
								{isInvalid && <FieldError errors={field.state.meta.errors} />}
							</Field>
						);
					}}
				</form.Field>

				<form.Field name="projectId">
					{(field) => {
						const selectValue = projectOptions.some(
							(project) => project._id === field.state.value
						)
							? field.state.value
							: "";
						return (
							<Field>
								<FieldLabel htmlFor={field.name}>Project</FieldLabel>
								<Select
									value={selectValue}
									onValueChange={(value: string | null) => {
										projectDirtyRef.current = true;
										field.handleChange(value ?? "");
									}}
									disabled={
										isSubmitting ||
										!canReadProjects ||
										!selectedClientId ||
										projectsLoading ||
										projectOptions.length === 0
									}
								>
									<SelectTrigger id={field.name} className="w-full">
										<SelectValue
											placeholder={
												!canReadProjects
													? "No access to projects"
													: !selectedClientId
														? "Select a client first"
														: projectsLoading
															? "Loading projects…"
															: projectOptions.length === 0
																? "No projects for this client"
																: "Select a project"
											}
										/>
									</SelectTrigger>
									<SelectContent>
										{projectOptions.map((project) => (
											<SelectItem key={project._id} value={project._id}>
												{project.title}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<FieldDescription>
									Optional — link this quote to an existing project.
								</FieldDescription>
							</Field>
						);
					}}
				</form.Field>

				<form.Field name="title">
					{(field) => (
						<Field>
							<FieldLabel htmlFor={field.name}>Title</FieldLabel>
							<Input
								id={field.name}
								name={field.name}
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								placeholder="e.g., Website Redesign Quote"
								disabled={isSubmitting}
							/>
						</Field>
					)}
				</form.Field>

				<form.Field name="validUntil">
					{(field) => (
						<Field>
							<FieldLabel htmlFor={field.name}>Valid until</FieldLabel>
							<DatePicker
								id={field.name}
								value={field.state.value}
								onChange={(date) => field.handleChange(date)}
								placeholder="Select valid until date"
								disabled={isSubmitting}
								disabledDates={{ before: startOfTomorrow() }}
							/>
							<FieldDescription>
								Optional — must be a future date.
							</FieldDescription>
						</Field>
					)}
				</form.Field>

				<form.Field name="clientMessage">
					{(field) => (
						<Field className="sm:col-span-2">
							<FieldLabel htmlFor={field.name}>Message to client</FieldLabel>
							<Textarea
								id={field.name}
								name={field.name}
								rows={4}
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								placeholder="Thank you for considering our services. We look forward to working with you."
								disabled={isSubmitting}
							/>
						</Field>
					)}
				</form.Field>

				<form.Field name="terms">
					{(field) => (
						<Field className="sm:col-span-2">
							<FieldLabel htmlFor={field.name}>Terms &amp; conditions</FieldLabel>
							<Textarea
								id={field.name}
								name={field.name}
								rows={4}
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								placeholder={DEFAULT_TERMS}
								disabled={isSubmitting}
							/>
						</Field>
					)}
				</form.Field>
			</FieldGroup>
		</CreateRecordDialog>
	);
}
