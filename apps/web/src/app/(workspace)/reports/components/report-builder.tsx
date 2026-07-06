"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { ArrowLeft, Loader2, Save, Send, Sparkles } from "lucide-react";
import { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import DatePickerRange from "@/components/shared/date-picker-range";
import { ReportPreview } from "./report-preview";
import {
	dateRangeOptions,
	detectDateRangePreset,
	entityOptions,
	getDateRange,
	groupByOptions,
	visualizationOptions,
	type EntityType,
	type ReportConfigShape,
	type VizType,
} from "../report-config";

export interface ReportBuilderInitial {
	name: string;
	description: string;
	entityType: EntityType;
	groupBy: string;
	vizType: VizType;
	dateRangePreset: string;
	customDateRange?: DateRange;
}

export interface ReportBuilderSavePayload {
	name: string;
	description?: string;
	config: ReportConfigShape;
	visualization: { type: VizType };
}

interface ReportBuilderProps {
	mode: "create" | "edit";
	initial: ReportBuilderInitial;
	saving: boolean;
	onSave: (payload: ReportBuilderSavePayload) => void | Promise<void>;
	onBack: () => void;
}

export function ReportBuilder({
	mode,
	initial,
	saving,
	onSave,
	onBack,
}: ReportBuilderProps) {
	const [name, setName] = useState(initial.name);
	const [description, setDescription] = useState(initial.description);
	const [entityType, setEntityType] = useState<EntityType>(initial.entityType);
	const [groupBy, setGroupBy] = useState(initial.groupBy);
	const [vizType, setVizType] = useState<VizType>(initial.vizType);
	const [dateRangePreset, setDateRangePreset] = useState(initial.dateRangePreset);
	const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>(
		initial.customDateRange
	);

	const [aiPrompt, setAiPrompt] = useState("");
	const [aiLoading, setAiLoading] = useState(false);
	const [aiResponse, setAiResponse] = useState("");

	const effectiveDateRange = () => {
		if (dateRangePreset === "custom" && customDateRange) {
			return {
				start: customDateRange.from?.getTime(),
				end: customDateRange.to
					? new Date(customDateRange.to).setHours(23, 59, 59, 999)
					: undefined,
			};
		}
		return getDateRange(dateRangePreset);
	};

	const config: ReportConfigShape = {
		entityType,
		groupBy: groupBy ? [groupBy] : undefined,
		dateRange: effectiveDateRange(),
	};

	// Drives the footer summary; Convex dedupes this against ReportPreview's
	// identical subscription, so there's no extra fetch.
	const reportData = useQuery(api.reportData.executeReport, {
		entityType: config.entityType,
		groupBy: config.groupBy?.[0],
		dateRange: config.dateRange,
	});

	const groupByLabel =
		groupByOptions[entityType]?.find((o) => o.value === groupBy)?.label ?? groupBy;
	const rangeLabel =
		dateRangeOptions.find((o) => o.value === dateRangePreset)?.label ?? "All Time";

	const handleAiGenerate = async () => {
		if (!aiPrompt.trim()) return;
		setAiLoading(true);
		setAiResponse("");
		try {
			const response = await fetch("/api/mastra/report", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ prompt: aiPrompt }),
			});
			if (!response.ok) throw new Error("Failed to generate report");
			const data = await response.json();

			if (data.config?.entityType) {
				const nextEntity = data.config.entityType as EntityType;
				setEntityType(nextEntity);
				const nextGroup =
					data.config.groupBy?.[0] ?? groupByOptions[nextEntity]?.[0]?.value;
				if (nextGroup) setGroupBy(nextGroup);
			}
			if (data.config?.dateRange) {
				setDateRangePreset(detectDateRangePreset(data.config.dateRange));
			}
			if (data.visualization?.type) setVizType(data.visualization.type);
			if (data.suggestedName && !name.trim()) setName(data.suggestedName);
			if (data.suggestedDescription && !description.trim())
				setDescription(data.suggestedDescription);

			setAiResponse("Configuration applied — review and save when ready.");
		} catch (error) {
			console.error("AI generation error:", error);
			setAiResponse("Couldn't generate that. Try rephrasing or set it up manually.");
		} finally {
			setAiLoading(false);
		}
	};

	const handleSave = () => {
		if (!name.trim()) return;
		void onSave({
			name: name.trim(),
			description: description.trim() || undefined,
			config: {
				entityType,
				groupBy: groupBy ? [groupBy] : undefined,
				dateRange: effectiveDateRange(),
			},
			visualization: { type: vizType },
		});
	};

	return (
		<div className="flex flex-col lg:h-[calc(100svh-1.75rem)] lg:overflow-hidden">
			{/* Top strip — spans rail + canvas; pt clears the header notch (~48px) */}
			<div className="flex flex-wrap items-center gap-3 border-b border-border/60 px-4 pb-3 pt-3 lg:pt-7">
				<Button
					intent="plain"
					size="sq-sm"
					onPress={onBack}
					aria-label={mode === "edit" ? "Cancel editing" : "Back to reports"}
				>
					<ArrowLeft className="h-4 w-4" />
				</Button>
				<input
					aria-label="Report name"
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="Untitled report"
					className="min-w-0 flex-1 rounded-md bg-transparent px-1.5 py-1 text-lg font-semibold text-foreground transition-colors placeholder:text-muted-foreground/60 hover:bg-muted/40 focus:bg-muted/40 focus:outline-none"
				/>
				<SegmentedViz value={vizType} onChange={setVizType} />
				<Button
					intent="primary"
					size="sm"
					onPress={handleSave}
					isDisabled={!name.trim() || saving}
				>
					{saving ? (
						<Loader2 className="h-4 w-4 animate-spin" data-slot="icon" />
					) : (
						<Save className="h-4 w-4" data-slot="icon" />
					)}
					{mode === "edit" ? "Save changes" : "Save report"}
				</Button>
			</div>

			{/* Body — config rail + chart canvas */}
			<div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:overflow-hidden">
				{/* Config rail */}
				<aside className="flex shrink-0 flex-col gap-6 border-b border-border/60 bg-background/50 px-4 py-5 lg:h-full lg:w-80 lg:overflow-y-auto lg:border-b-0 lg:border-r">
					{/* Data */}
					<section className="space-y-3">
						<h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							Data
						</h2>
						<div className="space-y-3">
							<div className="space-y-1.5">
								<Label className="text-xs">Source</Label>
								<Select
									value={entityType}
									onValueChange={(v) => {
										setEntityType(v as EntityType);
										const first = groupByOptions[v]?.[0]?.value;
										if (first) setGroupBy(first);
									}}
								>
									<SelectTrigger className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{entityOptions.map((opt) => {
											const Icon = opt.icon;
											return (
												<SelectItem key={opt.value} value={opt.value}>
													<span className="flex items-center gap-2">
														<Icon className="h-4 w-4 text-muted-foreground" />
														{opt.label}
													</span>
												</SelectItem>
											);
										})}
									</SelectContent>
								</Select>
							</div>

							<div className="space-y-1.5">
								<Label className="text-xs">Group by</Label>
								<Select value={groupBy} onValueChange={setGroupBy}>
									<SelectTrigger className="w-full">
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

							<div className="space-y-1.5">
								<Label className="text-xs">Date range</Label>
								<Select
									value={dateRangePreset}
									onValueChange={(value) => {
										setDateRangePreset(value);
										if (value !== "custom") setCustomDateRange(undefined);
									}}
								>
									<SelectTrigger className="w-full">
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

							{dateRangePreset === "custom" && (
								<DatePickerRange
									value={customDateRange}
									onChange={setCustomDateRange}
									showArrow={false}
								/>
							)}
						</div>
					</section>

					{/* Description */}
					<section className="space-y-2">
						<Label htmlFor="report-description" className="text-xs">
							Description
						</Label>
						<Textarea
							id="report-description"
							placeholder="What does this report show? (optional)"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							rows={2}
						/>
					</section>

					{/* AI assist */}
					<section className="space-y-3 rounded-xl border border-border/60 bg-muted/30 p-3">
						<h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							<Sparkles className="h-3.5 w-3.5 text-primary" />
							AI assist
						</h2>
						<Textarea
							aria-label="Describe the report you want"
							placeholder="e.g. Revenue by client this quarter"
							value={aiPrompt}
							onChange={(e) => setAiPrompt(e.target.value)}
							rows={3}
							className="bg-background"
						/>
						<Button
							intent="outline"
							size="sm"
							onPress={handleAiGenerate}
							isDisabled={!aiPrompt.trim() || aiLoading}
							className="w-full"
						>
							{aiLoading ? (
								<Loader2 className="h-4 w-4 animate-spin" data-slot="icon" />
							) : (
								<Send className="h-4 w-4" data-slot="icon" />
							)}
							Generate
						</Button>
						{aiResponse && (
							<p className="text-xs text-muted-foreground">{aiResponse}</p>
						)}
					</section>
				</aside>

				{/* Chart canvas */}
				<main className="flex min-w-0 flex-1 flex-col lg:h-full lg:overflow-hidden">
					<div className="flex-1 overflow-auto bg-muted/20 p-4 sm:p-8">
						<div className="mx-auto w-full max-w-4xl rounded-2xl border border-border/60 bg-background p-5 shadow-sm sm:p-7">
							<ReportPreview config={config} visualization={{ type: vizType }} />
						</div>
					</div>

					{/* Status bar */}
					<div className="flex items-center justify-between border-t border-border/60 px-4 py-2 text-xs text-muted-foreground">
						<span>
							{reportData === undefined
								? "Loading…"
								: reportData.data.length === 0
									? "No data for this selection"
									: `${reportData.data.length} ${
											reportData.data.length === 1 ? "group" : "groups"
										} · grouped by ${groupByLabel}`}
						</span>
						<span>{rangeLabel}</span>
					</div>
				</main>
			</div>
		</div>
	);
}

function SegmentedViz({
	value,
	onChange,
}: {
	value: VizType;
	onChange: (v: VizType) => void;
}) {
	return (
		<div
			role="radiogroup"
			aria-label="Visualization type"
			className="flex items-center gap-0.5 rounded-lg border border-border/60 bg-muted/40 p-0.5"
		>
			{visualizationOptions.map((opt) => {
				const Icon = opt.icon;
				const active = value === opt.value;
				return (
					<button
						key={opt.value}
						type="button"
						role="radio"
						aria-checked={active}
						aria-label={opt.label}
						onClick={() => onChange(opt.value)}
						className={cn(
							"flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
							active
								? "bg-background text-primary shadow-sm"
								: "text-muted-foreground hover:text-foreground"
						)}
					>
						<Icon className="h-4 w-4" />
						<span className="hidden sm:inline">{opt.label}</span>
					</button>
				);
			})}
		</div>
	);
}
