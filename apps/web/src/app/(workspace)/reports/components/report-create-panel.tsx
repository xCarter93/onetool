"use client";

import { useRouter } from "next/navigation";
import { ChevronRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { entityLabels } from "../report-config";
import {
	FEATURED_PRESETS,
	PRESET_CATEGORIES,
	PRESET_TONE_BOX,
	type PresetCategoryId,
} from "../report-presets";

const TONE_BY_CATEGORY = Object.fromEntries(
	PRESET_CATEGORIES.map((c) => [c.id, PRESET_TONE_BOX[c.tone]]),
) as Record<PresetCategoryId, string>;

interface ReportCreatePanelProps {
	onBrowsePresets: () => void;
}

export function ReportCreatePanel({ onBrowsePresets }: ReportCreatePanelProps) {
	const router = useRouter();

	return (
		<section
			className="workspace-panel overflow-hidden"
			aria-labelledby="report-create-heading"
		>
			<div className="border-b border-border px-4 py-4">
				<h2
					id="report-create-heading"
					className="text-base font-semibold text-foreground"
				>
					Create a report
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Start from a ready-made preset, or build the exact view your team
					needs from scratch.
				</p>
				<div className="mt-4 flex flex-wrap gap-2">
					<Button onClick={onBrowsePresets}>
						<Plus className="size-4" aria-hidden="true" />
						Browse presets
					</Button>
					<Button variant="outline" onClick={() => router.push("/reports/new")}>
						Start blank
					</Button>
				</div>
			</div>
			<div className="px-2 py-2">
				<h3 className="px-2 py-2 text-sm font-medium text-muted-foreground">
					Popular presets
				</h3>
				{FEATURED_PRESETS.map((preset) => {
					const Icon = preset.icon;
					return (
						<button
							key={preset.id}
							type="button"
							onClick={() => router.push(`/reports/new?preset=${preset.id}`)}
							className="group flex w-full items-start gap-3 rounded-sm px-2 py-3 text-left hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
						>
							<span
								className={cn(
									"flex size-8 shrink-0 items-center justify-center rounded-sm",
									TONE_BY_CATEGORY[preset.categoryId],
								)}
							>
								<Icon className="size-4" aria-hidden="true" />
							</span>
							<span className="min-w-0 flex-1">
								<span className="block text-sm font-medium text-foreground">
									{preset.name}
								</span>
								<span className="mt-1 block text-xs text-muted-foreground">
									{entityLabels[preset.config.entityType] ??
										preset.config.entityType}{" "}
									· {preset.description}
								</span>
							</span>
							<ChevronRight
								className="mt-1 size-4 shrink-0 text-muted-foreground"
								aria-hidden="true"
							/>
						</button>
					);
				})}
				<button
					type="button"
					onClick={onBrowsePresets}
					className="mx-2 my-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
				>
					Browse all presets{" "}
					<ChevronRight className="size-4" aria-hidden="true" />
				</button>
			</div>
		</section>
	);
}
