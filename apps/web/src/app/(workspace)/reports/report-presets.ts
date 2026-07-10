import { DollarSign, TrendingUp, Briefcase, type LucideIcon } from "lucide-react";
import {
	REPORT_PRESETS,
	type ReportPresetDefinition,
} from "@onetool/backend/convex/lib/reportPresets";
import { visualizationIcons } from "./report-config";

export type PresetCategoryId = "revenue" | "sales" | "operations";

export type PresetCategoryTone = "emerald" | "sky" | "violet";

export interface PresetCategory {
	id: PresetCategoryId;
	label: string;
	note: string;
	tone: PresetCategoryTone;
	icon: LucideIcon;
}

/** Rail categories — "All presets" is a UI-only sentinel, not one of these. */
export const PRESET_CATEGORIES: PresetCategory[] = [
	{
		id: "revenue",
		label: "Revenue & money",
		note: "Invoices, income, and billing",
		tone: "emerald",
		icon: DollarSign,
	},
	{
		id: "sales",
		label: "Sales pipeline",
		note: "Quotes, leads, and conversion",
		tone: "sky",
		icon: TrendingUp,
	},
	{
		id: "operations",
		label: "Operations",
		note: "Projects, tasks, and team",
		tone: "violet",
		icon: Briefcase,
	},
];

/** Sentinel category id for the "All presets" rail row (not a real category). */
export const ALL_PRESET_CATEGORY = "all";

const PRESET_CATEGORY_BY_ID: Record<string, PresetCategoryId> = {
	"revenue-by-month": "revenue",
	"average-invoice-value": "revenue",
	"projected-income": "revenue",
	"top-clients": "revenue",
	"overdue-invoices": "revenue",
	"quote-conversion": "sales",
	"quotes-awaiting-response": "sales",
	"lead-source-breakdown": "sales",
	"new-clients-by-month": "sales",
	"projects-by-status": "operations",
	"jobs-completed-by-month": "operations",
	"team-workload": "operations",
	"tasks-by-status": "operations",
	"clients-by-status": "operations",
};

export interface PresetListItem extends ReportPresetDefinition {
	categoryId: PresetCategoryId;
	icon: LucideIcon;
}

/** REPORT_PRESETS enriched with the web-only category + icon for the library dialog. */
export const PRESET_LIST: PresetListItem[] = REPORT_PRESETS.map((preset) => ({
	...preset,
	categoryId: PRESET_CATEGORY_BY_ID[preset.id],
	icon: visualizationIcons[preset.visualization],
}));

/** Tonal icon-box classes per category (shared by the dialog rail/rows and the create panel). */
export const PRESET_TONE_BOX: Record<PresetCategoryTone, string> = {
	emerald: "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",
	sky: "bg-sky-500/15 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
	violet: "bg-violet-500/15 text-violet-600 dark:bg-violet-500/20 dark:text-violet-400",
};

const FEATURED_PRESET_IDS = [
	"revenue-by-month",
	"overdue-invoices",
	"quote-conversion",
	"projects-by-status",
] as const;

/** Popular presets surfaced on the reports page create panel. */
export const FEATURED_PRESETS: PresetListItem[] = FEATURED_PRESET_IDS.map(
	(id) => PRESET_LIST.find((p) => p.id === id)
).filter((p): p is PresetListItem => p !== undefined);
