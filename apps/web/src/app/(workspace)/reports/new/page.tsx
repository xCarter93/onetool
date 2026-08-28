"use client";

import { Suspense, useState } from "react";
import { useMutation } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { PermissionGate } from "@/components/domain/permission-gate";
import { useToast } from "@/hooks/use-toast";
import { convexErrorMessage } from "@/lib/convex-error";
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
import { DEFAULT_GROUP_BY } from "@onetool/backend/convex/lib/reportFields";
import {
	DATE_RANGE_PRESETS,
	configForGroupByKey,
	type DateRangePreset,
} from "@onetool/backend/convex/lib/reportConfig";

function isEntity(v: string | null): v is EntityType {
	return !!v && entityOptions.some((o) => o.value === v);
}

function isViz(v: string | null): v is VizType {
	return !!v && visualizationOptions.some((o) => o.value === v);
}

function isRangePreset(v: string): v is DateRangePreset {
	return (DATE_RANGE_PRESETS as readonly string[]).includes(v);
}

/** Builds full builder-initial state from a REPORT_PRESETS entry, or null if the id is unknown. */
function buildInitialFromPreset(presetId: string): ReportBuilderInitial | null {
	const preset = REPORT_PRESETS.find((p) => p.id === presetId);
	if (!preset) return null;
	return {
		name: preset.name,
		description: preset.description,
		config: preset.config,
		visualization: preset.visualization,
	};
}

function NewReportInner() {
	const router = useRouter();
	const params = useSearchParams();
	const toast = useToast();
	const createReport = useMutation(api.reports.create);
	const [saving, setSaving] = useState(false);

	// ?preset=<id> takes priority; unknown/missing id falls through to the
	// legacy 5-param parsing below (back-compat for old template links).
	const presetId = params.get("preset");
	const presetInitial = presetId ? buildInitialFromPreset(presetId) : null;

	// Legacy template query params (?entity=&group=&viz=&range=&name=) still
	// seed a full config; without them a new report is a blank start (d14) —
	// no source selected, the canvas asks for one.
	const entityParam = params.get("entity");
	const groupParam = params.get("group");
	const vizParam = params.get("viz");
	const rangeParam = params.get("range") ?? "all_time";
	const name = params.get("name") ?? "";

	let paramConfig: ReportBuilderInitial["config"];
	let paramVisualization: ReportBuilderInitial["visualization"] = {
		type: "table",
	};
	if (isEntity(entityParam)) {
		const entityType: EntityType = entityParam;
		const validGroup = groupByOptions[entityType]?.some(
			(o) => o.value === groupParam
		);
		const groupBy =
			validGroup && groupParam ? groupParam : DEFAULT_GROUP_BY[entityType];
		const vizType: VizType = isViz(vizParam) ? vizParam : "table";
		const preset =
			rangeParam !== "all_time" && isRangePreset(rangeParam)
				? rangeParam
				: undefined;
		// ?group= may name a composite key (month, conversionRate, …), which
		// stands for a whole config rather than a field.
		const built = configForGroupByKey(entityType, groupBy, {
			...(preset ? { range: { kind: "preset" as const, preset } } : {}),
			visualization: { type: vizType },
		});
		paramConfig = built.config;
		paramVisualization = built.visualization;
	}

	const initial: ReportBuilderInitial =
		presetInitial ?? {
			name,
			description: "",
			config: paramConfig,
			visualization: paramVisualization,
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
			toast.error(
				"Couldn't save report",
				convexErrorMessage(error, "Please try again.")
			);
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
		<PermissionGate object="reports">
			<Suspense
				fallback={
					<div className="flex min-h-[400px] items-center justify-center">
						<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
					</div>
				}
			>
				<NewReportInner />
			</Suspense>
		</PermissionGate>
	);
}
