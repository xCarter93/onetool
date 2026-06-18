"use client";

import { Suspense, useState } from "react";
import { useMutation } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { api } from "@onetool/backend/convex/_generated/api";
import {
	ReportBuilder,
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

function NewReportInner() {
	const router = useRouter();
	const params = useSearchParams();
	const createReport = useMutation(api.reports.create);
	const [saving, setSaving] = useState(false);

	// Seed from template query params (?entity=&group=&viz=&range=&name=)
	const entityParam = params.get("entity");
	const entityType: EntityType = isEntity(entityParam) ? entityParam : "clients";
	const groupParam = params.get("group");
	const validGroup = groupByOptions[entityType]?.some(
		(o) => o.value === groupParam
	);
	const groupBy = validGroup && groupParam ? groupParam : "status";
	const vizParam = params.get("viz");
	const vizType: VizType = isViz(vizParam) ? vizParam : "bar";
	const dateRangePreset = params.get("range") ?? "all_time";
	const name = params.get("name") ?? "";

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
			initial={{
				name,
				description: "",
				entityType,
				groupBy,
				vizType,
				dateRangePreset,
			}}
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
