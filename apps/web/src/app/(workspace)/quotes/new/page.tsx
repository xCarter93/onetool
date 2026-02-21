"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { StickyFormFooter } from "@/components/shared/sticky-form-footer";
import {
	MagnifyingGlassIcon,
	UserIcon,
	DocumentTextIcon,
} from "@heroicons/react/16/solid";
import { FolderOpenIcon } from "@heroicons/react/24/outline";
import { CalendarIcon } from "lucide-react";
import ComboBox from "@/components/ui/combo-box";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";

interface Client {
	_id: Id<"clients">;
	companyName: string;
}

interface Project {
	_id: Id<"projects">;
	title: string;
	status: string;
	clientId: Id<"clients">;
}

export default function NewQuotePage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const toast = useToast();

	// Get project ID or client ID from URL params if provided
	const projectIdParam = searchParams.get("projectId") as Id<"projects"> | null;
	const clientIdParam = searchParams.get("clientId") as Id<"clients"> | null;

	// Form state
	const [selectedClient, setSelectedClient] = useState<Client | null>(null);
	const [selectedProject, setSelectedProject] = useState<Project | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	// Form fields
	const [quoteTitle, setQuoteTitle] = useState("");
	const [validUntil, setValidUntil] = useState<Date | undefined>(undefined);
	const [validUntilOpen, setValidUntilOpen] = useState(false);
	const [clientMessage, setClientMessage] = useState("");
	const [terms, setTerms] = useState(
		"Payment due within 30 days of acceptance"
	);

	// Fetch data from Convex
	const clientsResult = useQuery(api.clients.list, {});
	const clients = useMemo(() => clientsResult || [], [clientsResult]);
	const projectsResult = useQuery(
		api.projects.list,
		selectedClient ? { clientId: selectedClient._id } : "skip"
	);
	const projects = useMemo(() => projectsResult || [], [projectsResult]);

	// Get project from URL param
	const projectFromParam = useQuery(
		api.projects.get,
		projectIdParam ? { id: projectIdParam } : "skip"
	);

	// Mutations
	const createQuote = useMutation(api.quotes.create);

	// Set project and client from URL params
	useEffect(() => {
		if (projectFromParam && !selectedProject) {
			setSelectedProject(projectFromParam);
			// Find and set the client for this project
			const client = clients.find((c) => c._id === projectFromParam.clientId);
			if (client && !selectedClient) {
				setSelectedClient(client);
			}
		}
	}, [projectFromParam, clients, selectedProject, selectedClient]);

	// Set client from clientId URL param (when no projectId is provided)
	useEffect(() => {
		if (clientIdParam && !projectIdParam && !selectedClient && clients.length > 0) {
			const client = clients.find((c) => c._id === clientIdParam);
			if (client) {
				setSelectedClient(client);
			}
		}
	}, [clientIdParam, projectIdParam, clients, selectedClient]);

	const clientOptions = useMemo(
		() => clients.map((client) => client.companyName),
		[clients]
	);

	const projectOptions = useMemo(
		() => projects.map((project) => project.title),
		[projects]
	);

	const handleClientSelect = (selection: string | null) => {
		if (!selection) {
			setSelectedClient(null);
			setSelectedProject(null);
			return;
		}
		const client = clients.find((item) => item.companyName === selection);
		if (client) {
			setSelectedClient(client);
			setSelectedProject(null); // Reset project when client changes
		}
	};

	const handleProjectSelect = (selection: string | null) => {
		if (!projects) return;
		if (!selection) {
			setSelectedProject(null);
			return;
		}
		const project = projects.find((item) => item.title === selection);
		if (project) {
			setSelectedProject(project);
		}
	};

	const handleCreateQuote = async () => {
		if (!selectedClient) {
			toast.error(
				"Missing Client",
				"Please select a client before creating the quote."
			);
			return;
		}

		if (!selectedProject) {
			toast.error(
				"Missing Project",
				"Please select a project before creating the quote."
			);
			return;
		}

		setIsLoading(true);
		try {
			const quoteData = {
				clientId: selectedClient._id,
				projectId: selectedProject._id,
				title: quoteTitle || undefined,
				status: "draft" as const,
				subtotal: 0, // Will be calculated from line items
				total: 0, // Will be calculated from line items
				validUntil: validUntil ? validUntil.getTime() : undefined,
				clientMessage: clientMessage || undefined,
				terms: terms || undefined,
				pdfSettings: {
					showQuantities: true,
					showUnitPrices: true,
					showLineItemTotals: true,
					showTotals: true,
				},
			};

			const quoteId = await createQuote(quoteData);
			toast.success("Quote Created", "Quote has been successfully created!");
			router.push(`/quotes/${quoteId}/quoteLineEditor`);
		} catch (error) {
			console.error("Failed to create quote:", error);
			toast.error("Error", "Failed to create quote. Please try again.");
		} finally {
			setIsLoading(false);
		}
	};

	const formatStatus = (status: string) => {
		switch (status) {
			case "in-progress":
				return "In Progress";
			case "completed":
				return "Completed";
			case "cancelled":
				return "Cancelled";
			case "planned":
				return "Planned";
			default:
				return status;
		}
	};

	const formatDisplayDate = (date?: Date | number) => {
		if (!date) return "Not set";
		const dateObj = typeof date === "number" ? new Date(date) : date;
		return dateObj.toLocaleDateString("en-US", {
			year: "numeric",
			month: "long",
			day: "numeric",
		});
	};

	const getStatusColor = (status: string) => {
		switch (status) {
			case "planned":
				return "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400";
			case "in-progress":
				return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400";
			case "completed":
				return "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400";
			case "cancelled":
				return "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400";
			default:
				return "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400";
		}
	};

	return (
		<div className="flex flex-col min-h-screen">
			<div className="flex-1 w-full px-6">
				<div className="w-full pt-8 pb-24">
					{/* Header */}
					<div className="mb-8">
						<h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
							Create New Quote
						</h1>
						<p className="mt-3 text-base text-gray-600 dark:text-gray-400 max-w-2xl">
							Create a professional quote for your client with detailed line
							items and terms.
						</p>
					</div>

					<form className="space-y-8">
						{/* Client and Project Selection */}
						<div className="grid grid-cols-1 gap-6 lg:grid-cols-2 mb-8">
							{/* Client Information Card */}
							<Card className="shadow-sm border-gray-200/60 dark:border-white/10">
								<CardHeader className="pb-4">
									<CardTitle className="flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-white">
										<MagnifyingGlassIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
										Client Information
									</CardTitle>
								</CardHeader>
								<CardContent className="space-y-4">
									<div className="grid gap-2">
										<label className="text-sm text-gray-600 dark:text-gray-400 text-left">
											Selected Client *
										</label>
										<ComboBox
											options={clientOptions}
											placeholder={
												selectedClient?.companyName ?? "Select a client..."
											}
											onSelect={handleClientSelect}
											disabled={isLoading}
										/>
								</div>

								{selectedClient && (
									<div className="text-sm text-gray-600 dark:text-gray-400">
										Selected: {selectedClient.companyName}
									</div>
								)}
							</CardContent>
							</Card>

							{/* Project Selection Card */}
							<Card className="shadow-sm border-gray-200/60 dark:border-white/10">
								<CardHeader className="pb-4">
									<CardTitle className="flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-white">
										<FolderOpenIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
										Link to Project
									</CardTitle>
								</CardHeader>
								<CardContent className="space-y-4">
									<div className="grid gap-2">
										<label className="text-sm text-gray-600 dark:text-gray-400 text-left">
											Selected Project *
										</label>
										<ComboBox
											options={projectOptions}
											placeholder={
												selectedProject
													? selectedProject.title
													: selectedClient
														? projectOptions.length > 0
															? "Select a project..."
															: "No projects for this client"
														: "Select a client first..."
											}
											onSelect={handleProjectSelect}
											disabled={
												!selectedClient ||
												projectOptions.length === 0 ||
												isLoading
											}
										/>
									</div>

									{selectedProject ? (
										<div className="grid grid-cols-2 gap-4 text-sm">
											<div>
												<span className="text-gray-500 dark:text-gray-400">
													Status:
												</span>
												<div className="flex items-center gap-2 mt-1">
													<Badge
														className={getStatusColor(selectedProject.status)}
														variant="outline"
													>
														{formatStatus(selectedProject.status)}
													</Badge>
												</div>
											</div>
										</div>
									) : selectedClient ? (
										<div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
											{projectOptions.length === 0
												? "No projects available for this client"
												: "Select a project above to view details"}
										</div>
									) : (
										<div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
											Select a client to view project information
										</div>
									)}
								</CardContent>
							</Card>
						</div>

						{/* Quote Details */}
						<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
							{/* Basic Quote Information */}
							<Card className="shadow-sm border-gray-200/60 dark:border-white/10">
								<CardHeader className="pb-4">
									<CardTitle className="flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-white">
										<DocumentTextIcon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
										Quote Information
									</CardTitle>
								</CardHeader>
								<CardContent className="space-y-6">
									<div>
										<label
											htmlFor="quote-title"
											className="block text-sm font-medium text-gray-900 dark:text-white mb-2"
										>
											Quote Title (Optional)
										</label>
										<Input
											id="quote-title"
											name="quote-title"
											type="text"
											placeholder="e.g., Website Redesign Quote"
											value={quoteTitle}
											onChange={(e) => setQuoteTitle(e.target.value)}
											className="w-full h-11"
										/>
									</div>

									<div>
										<label
											htmlFor="valid-until"
											className="block text-sm font-medium text-gray-900 dark:text-white mb-2"
										>
											Valid Until (Optional)
										</label>
										<Popover
											open={validUntilOpen}
											onOpenChange={setValidUntilOpen}
										>
											<PopoverTrigger asChild>
												<Button
													intent="outline"
													className="w-full justify-start text-left font-normal"
												>
													<CalendarIcon className="mr-2 h-4 w-4" />
													{validUntil
														? formatDisplayDate(validUntil)
														: "Select valid until date"}
												</Button>
											</PopoverTrigger>
											<PopoverContent
												className="w-auto p-0 bg-white dark:bg-gray-950"
												align="start"
											>
												<Calendar
													mode="single"
													selected={validUntil}
													onSelect={(date) => {
														setValidUntil(date);
														setValidUntilOpen(false);
													}}
													disabled={isLoading}
													className="!bg-white dark:!bg-gray-950"
												/>
											</PopoverContent>
										</Popover>
									</div>
								</CardContent>
							</Card>

							{/* Terms & Message */}
							<Card className="shadow-sm border-gray-200/60 dark:border-white/10">
								<CardHeader className="pb-4">
									<CardTitle className="flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-white">
										<UserIcon className="h-5 w-5 text-orange-600 dark:text-orange-400" />
										Terms & Client Message
									</CardTitle>
								</CardHeader>
								<CardContent className="space-y-6">
									<div>
										<label
											htmlFor="client-message"
											className="block text-sm font-medium text-gray-900 dark:text-white mb-2"
										>
											Message to Client (Optional)
										</label>
										<textarea
											id="client-message"
											name="client-message"
											rows={3}
											value={clientMessage}
											onChange={(e) => setClientMessage(e.target.value)}
											className="block w-full rounded-md bg-white dark:bg-white/5 px-3 py-2.5 text-base text-gray-900 dark:text-white border border-gray-300 dark:border-white/10 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400 transition-colors"
											placeholder="Thank you for considering our services. We look forward to working with you."
										/>
									</div>

									<div>
										<label
											htmlFor="terms"
											className="block text-sm font-medium text-gray-900 dark:text-white mb-2"
										>
											Terms & Conditions
										</label>
										<textarea
											id="terms"
											name="terms"
											rows={4}
											value={terms}
											onChange={(e) => setTerms(e.target.value)}
											className="block w-full rounded-md bg-white dark:bg-white/5 px-3 py-2.5 text-base text-gray-900 dark:text-white border border-gray-300 dark:border-white/10 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400 transition-colors"
											placeholder="Payment due within 30 days of acceptance"
										/>
									</div>
								</CardContent>
							</Card>
						</div>

						{/* Next Steps Info */}
						<Card className="shadow-sm border-gray-200/60 dark:border-white/10 bg-blue-50/50 dark:bg-blue-900/10">
							<CardContent className="pt-6">
								<div className="flex items-start gap-3">
									<div className="w-2 h-2 bg-blue-500 rounded-full mt-2 shrink-0" />
									<div>
										<p className="text-sm font-medium text-blue-900 dark:text-blue-200">
											Next Steps
										</p>
										<p className="text-xs text-blue-800 dark:text-blue-300 mt-1">
											After creating the quote, you&apos;ll be taken to the line
											item editor to add services, products, and pricing
											details.
										</p>
									</div>
								</div>
							</CardContent>
						</Card>
					</form>
				</div>
			</div>

			<StickyFormFooter
				buttons={[
					{
						label: isLoading ? "Creating..." : "Create Quote",
						onClick: handleCreateQuote,
						intent: "primary",
						isLoading,
						position: "left",
					},
				]}
			/>
		</div>
	);
}
