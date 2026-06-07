"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	ArrowLeft,
	BarChart3,
	Save,
	Loader2,
	TrendingUp,
	PieChart,
	Table as TableIcon,
	Pencil,
	Eye,
	Settings2,
	Database,
	Calendar,
	LayoutGrid,
} from "lucide-react";
import { useRouter, useParams } from "next/navigation";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { ReportPreview } from "../components/report-preview";
import { StyledButton } from "@/components/ui/styled/styled-button";
import DatePickerRange from "@/components/shared/date-picker-range";
import { DateRange } from "react-day-picker";

const entityOptions = [
	{ value: "clients", label: "Clients" },
	{ value: "projects", label: "Projects" },
	{ value: "tasks", label: "Tasks" },
	{ value: "quotes", label: "Quotes" },
	{ value: "invoices", label: "Invoices" },
	{ value: "activities", label: "Activities" },
];

const groupByOptions: Record<string, { value: string; label: string }[]> = {
	clients: [
		{ value: "status", label: "Status" },
		{ value: "leadSource", label: "Lead Source" },
	],
	projects: [
		{ value: "status", label: "Status" },
		{ value: "projectType", label: "Project Type" },
	],
	tasks: [
		{ value: "status", label: "Status" },
		{ value: "completionRate", label: "Completion Rate" },
	],
	quotes: [
		{ value: "status", label: "Status" },
		{ value: "conversionRate", label: "Conversion Rate" },
	],
	invoices: [
		{ value: "status", label: "Status" },
		{ value: "month", label: "Month" },
		{ value: "client", label: "Client" },
	],
	activities: [{ value: "activityType", label: "Activity Type" }],
};

const visualizationOptions = [
	{ value: "bar", label: "Bar Chart", icon: BarChart3 },
	{ value: "line", label: "Line Chart", icon: TrendingUp },
	{ value: "pie", label: "Pie Chart", icon: PieChart },
	{ value: "table", label: "Table", icon: TableIcon },
];

const dateRangeOptions = [
	{ value: "all_time", label: "All Time" },
	{ value: "today", label: "Today" },
	{ value: "this_week", label: "This Week" },
	{ value: "this_month", label: "This Month" },
	{ value: "this_quarter", label: "This Quarter" },
	{ value: "this_year", label: "This Year" },
	{ value: "last_7_days", label: "Last 7 Days" },
	{ value: "last_30_days", label: "Last 30 Days" },
	{ value: "last_90_days", label: "Last 90 Days" },
	{ value: "last_year", label: "Last Year" },
	{ value: "custom", label: "Custom Range" },
];

type EntityType = "clients" | "projects" | "tasks" | "quotes" | "invoices" | "activities";
type VizType = "table" | "bar" | "line" | "pie";

export default function ReportViewPage() {
	const router = useRouter();
	const params = useParams();
	const reportId = params.reportId as string;

	const report = useQuery(api.reports.get, { id: reportId as Id<"reports"> });
	const updateReport = useMutation(api.reports.update);

	const [isEditing, setIsEditing] = useState(false);
	const [isSaving, setIsSaving] = useState(false);

	// Form state
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [entityType, setEntityType] = useState<EntityType>("clients");
	const [groupBy, setGroupBy] = useState<string>("status");
	const [vizType, setVizType] = useState<VizType>("bar");
	const [dateRangePreset, setDateRangePreset] = useState<string>("this_month");
	const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>(undefined);

	// Initialize form state when the loaded report changes (during render)
	const [prevReportId, setPrevReportId] = useState(report?._id);
	if (report && report._id !== prevReportId) {
		setPrevReportId(report._id);
		setName(report.name);
		setDescription(report.description || "");
		setEntityType(report.config.entityType);
		setGroupBy(report.config.groupBy?.[0] || "status");
		setVizType(report.visualization.type);
		// Detect date range preset from report config
		if (report.config.dateRange) {
			setDateRangePreset(detectDateRangePreset(report.config.dateRange));
		} else {
			setDateRangePreset("all_time");
		}
	}

	// Get effective date range (custom or preset)
	const getEffectiveDateRange = () => {
		if (dateRangePreset === "custom" && customDateRange) {
			return {
				start: customDateRange.from?.getTime(),
				end: customDateRange.to ? new Date(customDateRange.to).setHours(23, 59, 59, 999) : undefined,
			};
		}
		return getDateRange(dateRangePreset);
	};

	const handleSave = async () => {
		if (!name.trim()) return;

		setIsSaving(true);

		try {
			await updateReport({
				id: reportId as Id<"reports">,
				name: name.trim(),
				description: description.trim() || undefined,
				config: {
					entityType,
					groupBy: groupBy ? [groupBy] : undefined,
					dateRange: getEffectiveDateRange(),
				},
				visualization: {
					type: vizType,
				},
			});

			setIsEditing(false);
		} catch (error) {
			console.error("Failed to save report:", error);
		} finally {
			setIsSaving(false);
		}
	};

	const handleCancel = () => {
		if (report) {
			setName(report.name);
			setDescription(report.description || "");
			setEntityType(report.config.entityType);
			setGroupBy(report.config.groupBy?.[0] || "status");
			setVizType(report.visualization.type);
		}
		setIsEditing(false);
	};

	if (report === undefined) {
		return (
			<div className="p-6 flex items-center justify-center min-h-[400px]">
				<Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (report === null) {
		return (
			<div className="p-6 text-center">
				<h1 className="text-xl font-semibold text-foreground mb-2">Report not found</h1>
				<p className="text-muted-foreground mb-4">
					This report may have been deleted or you do not have access to it.
				</p>
				<StyledButton intent="primary" onClick={() => router.push("/reports")}>
					Back to Reports
				</StyledButton>
			</div>
		);
	}

	// Current config for preview
	const config = {
		entityType,
		groupBy: groupBy ? [groupBy] : undefined,
		dateRange: getEffectiveDateRange(),
	};

	const visualization = {
		type: vizType,
	};

	return (
		<div className="relative p-6 space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<Button
						intent="outline"
						size="sq-sm"
						onPress={() => router.push("/reports")}
					>
						<ArrowLeft className="w-4 h-4" />
					</Button>
					<div className="w-1.5 h-6 bg-linear-to-b from-primary to-primary/60 rounded-full" />
					<div>
						<h1 className="text-2xl font-bold text-foreground">
							{isEditing ? "Edit Report" : report.name}
						</h1>
						<p className="text-muted-foreground text-sm">
							{isEditing
								? "Modify your report configuration"
								: report.description || "View and analyze your report"}
						</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					{isEditing ? (
						<>
							<StyledButton intent="outline" onClick={handleCancel} showArrow={false}>
								Cancel
							</StyledButton>
							<StyledButton
								intent="primary"
								onClick={handleSave}
								disabled={!name.trim() || isSaving}
								showArrow={false}
							>
								{isSaving ? (
									<Loader2 className="w-4 h-4 mr-2 animate-spin" />
								) : (
									<Save className="w-4 h-4 mr-2" />
								)}
								Save Changes
							</StyledButton>
						</>
					) : (
						<StyledButton intent="outline" onClick={() => setIsEditing(true)} showArrow={false}>
							<Pencil className="w-4 h-4 mr-2" />
							Edit
						</StyledButton>
					)}
				</div>
			</div>

			<div className={`grid gap-6 ${isEditing ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"}`}>
				{/* Edit Form (shown when editing) */}
				{isEditing && (
					<Card className="group relative backdrop-blur-md overflow-hidden ring-1 ring-border/20 dark:ring-border/40">
						<div className="absolute inset-0 bg-linear-to-br from-white/10 via-white/5 to-transparent dark:from-white/5 dark:via-white/2 dark:to-transparent rounded-2xl" />
						<CardHeader className="relative z-10">
							<CardTitle className="text-base">Configuration</CardTitle>
							<CardDescription>
								Update your report settings
							</CardDescription>
						</CardHeader>
						<CardContent className="relative z-10 space-y-6">
							{/* Basic Info Section */}
							<div className="space-y-4">
								<div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
									<Settings2 className="w-4 h-4" />
									<span>Basic Information</span>
								</div>
								<div className="space-y-4 pl-6">
									<div className="space-y-2">
										<Label htmlFor="name">Report Name</Label>
										<Input
											id="name"
											value={name}
											onChange={(e) => setName(e.target.value)}
											className="transition-all focus:ring-2 focus:ring-primary/20"
										/>
									</div>

									<div className="space-y-2">
										<Label htmlFor="description">Description</Label>
										<Textarea
											id="description"
											value={description}
											onChange={(e) => setDescription(e.target.value)}
											rows={2}
											className="transition-all focus:ring-2 focus:ring-primary/20"
										/>
									</div>
								</div>
							</div>

							<div className="border-t border-border/50" />

							{/* Data Configuration Section */}
							<div className="space-y-4">
								<div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
									<Database className="w-4 h-4" />
									<span>Data Configuration</span>
								</div>
								<div className="pl-6">
									<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
										<div className="space-y-2">
											<Label>Data Source</Label>
											<Select
												value={entityType}
												onValueChange={(v) => {
													setEntityType(v as EntityType);
													const firstOption = groupByOptions[v]?.[0]?.value;
													if (firstOption) setGroupBy(firstOption);
												}}
											>
												<SelectTrigger className="transition-all focus:ring-2 focus:ring-primary/20">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{entityOptions.map((opt) => (
														<SelectItem key={opt.value} value={opt.value}>
															{opt.label}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>

										<div className="space-y-2">
											<Label>Group By</Label>
											<Select value={groupBy} onValueChange={setGroupBy}>
												<SelectTrigger className="transition-all focus:ring-2 focus:ring-primary/20">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{groupByOptions[entityType]?.map((opt) => (
														<SelectItem key={opt.value} value={opt.value}>
															{opt.label}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>

										<div className="space-y-2">
											<Label>Date Range</Label>
											<Select value={dateRangePreset} onValueChange={(value) => {
												setDateRangePreset(value);
												if (value !== "custom") {
													setCustomDateRange(undefined);
												}
											}}>
												<SelectTrigger className="transition-all focus:ring-2 focus:ring-primary/20">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{dateRangeOptions.map((opt) => (
														<SelectItem key={opt.value} value={opt.value}>
															{opt.label}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									</div>
									{dateRangePreset === "custom" && (
										<div className="mt-3 p-4 rounded-xl bg-muted/30 border border-border/50 space-y-3">
											<div className="flex items-center gap-2">
												<div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
													<Calendar className="w-3 h-3 text-primary" />
												</div>
												<p className="text-xs font-medium text-muted-foreground">Select a custom date range</p>
											</div>
											<DatePickerRange
												value={customDateRange}
												onChange={(range) => setCustomDateRange(range)}
												showArrow={false}
											/>
										</div>
									)}
								</div>
							</div>

							<div className="border-t border-border/50" />

							{/* Visualization Section */}
							<div className="space-y-4">
								<div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
									<LayoutGrid className="w-4 h-4" />
									<span>Visualization</span>
								</div>
								<div className="pl-6">
									<div className="grid grid-cols-4 gap-2">
										{visualizationOptions.map((opt) => {
											const Icon = opt.icon;
											return (
												<StyledButton
													key={opt.value}
													onClick={() => setVizType(opt.value as VizType)}
													intent={vizType === opt.value ? "primary" : "outline"}
													className="flex flex-col items-center gap-1.5 p-3 h-auto transition-all hover:scale-[1.02]"
													showArrow={false}
												>
													<Icon className="w-5 h-5" />
													<span className="text-xs">{opt.label}</span>
												</StyledButton>
											);
										})}
									</div>
								</div>
							</div>
						</CardContent>
					</Card>
				)}

				{/* Report Visualization */}
				<Card className="group relative backdrop-blur-md overflow-hidden ring-1 ring-border/20 dark:ring-border/40">
					<div className="absolute inset-0 bg-linear-to-br from-white/10 via-white/5 to-transparent dark:from-white/5 dark:via-white/2 dark:to-transparent rounded-2xl" />
					<CardHeader className="relative z-10">
						<CardTitle className="text-base flex items-center gap-2">
							<Eye className="w-4 h-4 text-primary" />
							{isEditing ? "Preview" : "Report Data"}
						</CardTitle>
						<CardDescription>
							{isEditing
								? "Live preview of your report changes"
								: `${entityOptions.find((e) => e.value === entityType)?.label || entityType} data ${groupBy ? `grouped by ${groupBy}` : ""}`}
						</CardDescription>
					</CardHeader>
					<CardContent className="relative z-10">
						<ReportPreview config={config} visualization={visualization} />
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

function getDateRange(preset: string): { start?: number; end?: number } | undefined {
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const endOfToday = new Date(today);
	endOfToday.setHours(23, 59, 59, 999);

	switch (preset) {
		case "today": {
			return { start: today.getTime(), end: endOfToday.getTime() };
		}
		case "this_week": {
			const dayOfWeek = today.getDay();
			const startOfWeek = new Date(today);
			startOfWeek.setDate(today.getDate() - dayOfWeek);
			const endOfWeek = new Date(startOfWeek);
			endOfWeek.setDate(startOfWeek.getDate() + 6);
			endOfWeek.setHours(23, 59, 59, 999);
			return { start: startOfWeek.getTime(), end: endOfWeek.getTime() };
		}
		case "this_month": {
			const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
			const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
			endOfMonth.setHours(23, 59, 59, 999);
			return { start: startOfMonth.getTime(), end: endOfMonth.getTime() };
		}
		case "this_quarter": {
			const quarter = Math.floor(today.getMonth() / 3);
			const startOfQuarter = new Date(today.getFullYear(), quarter * 3, 1);
			const endOfQuarter = new Date(today.getFullYear(), (quarter + 1) * 3, 0);
			endOfQuarter.setHours(23, 59, 59, 999);
			return { start: startOfQuarter.getTime(), end: endOfQuarter.getTime() };
		}
		case "this_year": {
			const startOfYear = new Date(today.getFullYear(), 0, 1);
			const endOfYear = new Date(today.getFullYear(), 11, 31);
			endOfYear.setHours(23, 59, 59, 999);
			return { start: startOfYear.getTime(), end: endOfYear.getTime() };
		}
		case "last_7_days": {
			const start = new Date(today);
			start.setDate(today.getDate() - 6);
			return { start: start.getTime(), end: endOfToday.getTime() };
		}
		case "last_30_days": {
			const start = new Date(today);
			start.setDate(today.getDate() - 29);
			return { start: start.getTime(), end: endOfToday.getTime() };
		}
		case "last_90_days": {
			const start = new Date(today);
			start.setDate(today.getDate() - 89);
			return { start: start.getTime(), end: endOfToday.getTime() };
		}
		case "last_year": {
			const startOfLastYear = new Date(today.getFullYear() - 1, 0, 1);
			const endOfLastYear = new Date(today.getFullYear() - 1, 11, 31);
			endOfLastYear.setHours(23, 59, 59, 999);
			return { start: startOfLastYear.getTime(), end: endOfLastYear.getTime() };
		}
		case "all_time":
		default:
			return undefined;
	}
}

function detectDateRangePreset(
	dateRange: { start?: number; end?: number }
): string {
	if (!dateRange.start) return "all_time";

	const now = new Date();
	const startDate = new Date(dateRange.start);

	// Check if it's this month
	if (
		startDate.getMonth() === now.getMonth() &&
		startDate.getFullYear() === now.getFullYear() &&
		startDate.getDate() === 1
	) {
		return "this_month";
	}

	// Check if it's this quarter
	const currentQuarter = Math.floor(now.getMonth() / 3);
	const startQuarter = Math.floor(startDate.getMonth() / 3);
	if (
		startQuarter === currentQuarter &&
		startDate.getFullYear() === now.getFullYear()
	) {
		return "this_quarter";
	}

	// Check if it's this year
	if (
		startDate.getFullYear() === now.getFullYear() &&
		startDate.getMonth() === 0 &&
		startDate.getDate() === 1
	) {
		return "this_year";
	}

	return "all_time";
}

