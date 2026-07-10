"use client";

import { Suspense, useState } from "react";
import { useMutation } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { api } from "@onetool/backend/convex/_generated/api";
import { REPORT_PRESETS } from "@onetool/backend/convex/lib/reportPresets";
import {
	ReportBuilder,
	type ReportBuilderInitial,
	type ReportBuilderSavePayload,
} from "../components/report-builder";
import {
	entityOptions,
	groupByOptions,
	visualizationOptions,
	type EntityType,
	type VizType,
} from "../report-config";

function isEntity(v: string | null): v is EntityType {
	return !!v && entityOptions.some((o) => o.value === v);
}

function isViz(v: string | null): v is VizType {
	return !!v && visualizationOptions.some((o) => o.value === v);
}

/** Builds full builder-initial state from a REPORT_PRESETS entry, or null if the id is unknown. */
function buildInitialFromPreset(presetId: string): ReportBuilderInitial | null {
	const preset = REPORT_PRESETS.find((p) => p.id === presetId);
	if (!preset) return null;
	return {
		name: preset.name,
		description: preset.description,
		entityType: preset.entityType,
		groupBy: preset.groupBy ?? undefined,
		vizType: preset.visualization,
		dateRangePreset: preset.dateRangePreset,
		filters: preset.filters ?? undefined,
		measure:
			preset.measure && preset.measure.op !== "count" && preset.measure.field
				? { op: preset.measure.op, field: preset.measure.field }
				: { op: "count" },
		columns: preset.columns ?? [],
	};
}

function NewReportInner() {
	const router = useRouter();
	const params = useSearchParams();
	const createReport = useMutation(api.reports.create);
	const [saving, setSaving] = useState(false);

	// ?preset=<id> takes priority; unknown/missing id falls through to the
	// legacy 5-param parsing below (back-compat for old template links).
	const presetId = params.get("preset");
	const presetInitial = presetId ? buildInitialFromPreset(presetId) : null;

	// Seed from template query params (?entity=&group=&viz=&range=&name=)
	const entityParam = params.get("entity");
	const entityType: EntityType = isEntity(entityParam) ? entityParam : "clients";
	const groupParam = params.get("group");
	const validGroup = groupByOptions[entityType]?.some(
		(o) => o.value === groupParam
	);
	const groupBy = validGroup && groupParam ? groupParam : "status";
	const vizParam = params.get("viz");
	// Slice 3-D3: the table is the base layer — a blank new report starts as
	// a plain table, not a chart (charts are an opt-in "Add chart" layer that
	// requires a Group by). Legacy ?viz= links keep working.
	const vizType: VizType = isViz(vizParam) ? vizParam : "table";
	const dateRangePreset = params.get("range") ?? "all_time";
	const name = params.get("name") ?? "";

	const initial: ReportBuilderInitial =
		presetInitial ?? {
			name,
			description: "",
			entityType,
			groupBy,
			vizType,
			dateRangePreset,
		};

	const handleSave = async (payload: ReportBuilderSavePayload) => {
		setSaving(true);
		try {
			const reportId = await createReport({
				name: payload.name,
				description: payload.description,
				config: payload.config,
				visualization: payload.visualization,
				isPublic: false,
			});
			router.push(`/reports/${reportId}`);
		} catch (error) {
			console.error("Failed to save report:", error);
			setSaving(false);
		}
	};

	return (
		<ReportBuilder
			mode="create"
			initial={initial}
			saving={saving}
			onSave={handleSave}
			onBack={() => router.push("/reports")}
		/>
	);
}

export default function NewReportPage() {
	return (
		<Suspense
			fallback={
				<div className="flex min-h-[400px] items-center justify-center">
					<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
				</div>
			}
		>
			<NewReportInner />
		</Suspense>
	);
}
