"use client";

import { useRouter } from "next/navigation";
import { BarChart3, ChevronRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { StyledButton } from "@/components/ui/styled/styled-button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { entityLabels } from "../report-config";
import {
	FEATURED_PRESETS,
	PRESET_CATEGORIES,
	PRESET_TONE_BOX,
	type PresetCategoryId,
} from "../report-presets";

const TONE_BY_CATEGORY = Object.fromEntries(
	PRESET_CATEGORIES.map((c) => [c.id, PRESET_TONE_BOX[c.tone]])
) as Record<PresetCategoryId, string>;

interface ReportCreatePanelProps {
	onBrowsePresets: () => void;
}

/**
 * Persistent create hero on the reports index (adapted from the ReUI
 * empty-state-4 block) — always rendered, so it doubles as the empty state
 * when no reports exist yet. Left: copy + CTAs; right: popular preset
 * shortcuts that seed the builder directly.
 */
export function ReportCreatePanel({ onBrowsePresets }: ReportCreatePanelProps) {
	const router = useRouter();

	return (
		<Card className="relative w-full overflow-hidden p-0 shadow-xs">
			<CardContent className="overflow-hidden p-0">
				<div className="grid grid-cols-1 items-stretch lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
					<div className="flex min-w-0 items-center justify-between gap-6 px-7 py-8 sm:px-9 lg:pr-6">
						<Empty className="items-start justify-center gap-6 text-left">
							<EmptyHeader className="max-w-md items-start gap-4 text-left">
								<EmptyMedia
									variant="icon"
									className="mb-0 items-center justify-center self-start"
								>
									<BarChart3 aria-hidden="true" />
								</EmptyMedia>

								<div className="flex flex-col gap-2">
									<EmptyTitle className="text-xl font-semibold tracking-tight sm:text-2xl">
										Create a report
									</EmptyTitle>
									<EmptyDescription className="text-sm/relaxed">
										<span className="block">
											Start from a ready-made preset, or build the
										</span>
										<span className="block">
											exact view your team needs from scratch.
										</span>
									</EmptyDescription>
								</div>
							</EmptyHeader>

							<EmptyContent className="max-w-none items-start gap-0 text-left">
								<div className="flex w-full items-center gap-2 max-[420px]:flex-wrap">
									<StyledButton
										intent="primary"
										showArrow={false}
										icon={<Plus className="h-4 w-4" aria-hidden="true" />}
										onClick={onBrowsePresets}
										className="shrink-0 whitespace-nowrap"
									>
										Browse presets
									</StyledButton>

									<StyledButton
										intent="outline"
										showArrow={false}
										onClick={() => router.push("/reports/new")}
										className="shrink-0 whitespace-nowrap"
									>
										Start blank
									</StyledButton>
								</div>
							</EmptyContent>
						</Empty>

						{/* Illustration fills the left column's spare width on wide screens. */}
						<BoardIllustration className="hidden shrink-0 md:block lg:hidden xl:block" />
					</div>

					{/* Popular presets — each row seeds the builder directly. */}
					<div className="min-w-0 border-t border-border/60 bg-muted/10 px-6 py-6 sm:px-7 lg:border-l lg:border-t-0">
						<div className="flex h-full flex-col justify-center gap-2">
							<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								Popular presets
							</p>

							{FEATURED_PRESETS.map((preset) => {
								const Icon = preset.icon;
								return (
									<button
										key={preset.id}
										type="button"
										onClick={() => router.push(`/reports/new?preset=${preset.id}`)}
										className="group flex w-full cursor-pointer items-center gap-3 rounded-lg border border-border/60 bg-background p-2.5 text-left transition-colors duration-150 hover:border-border hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
									>
										<span
											className={cn(
												"flex size-8 shrink-0 items-center justify-center rounded-lg",
												TONE_BY_CATEGORY[preset.categoryId]
											)}
										>
											<Icon className="h-4 w-4" aria-hidden="true" />
										</span>
										<span className="min-w-0 flex-1">
											<span className="block truncate text-sm font-medium text-foreground">
												{preset.name}
											</span>
											<span className="block truncate text-xs text-muted-foreground">
												{entityLabels[preset.entityType] ?? preset.entityType} ·{" "}
												{preset.description}
											</span>
										</span>
										<ChevronRight
											className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-colors duration-150 group-hover:text-foreground"
											aria-hidden="true"
										/>
									</button>
								);
							})}

							<button
								type="button"
								onClick={onBrowsePresets}
								className="mt-1 inline-flex w-fit cursor-pointer items-center gap-1 rounded text-sm font-medium text-primary transition-colors duration-150 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
							>
								Browse all presets
								<ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
							</button>
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

/** Patrick's isometric-board illustration — decorative corner accent. */
function BoardIllustration({ className }: { className?: string }) {
	return (
		<svg
			width="180"
			height="160"
			viewBox="0 0 180 160"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			aria-hidden="true"
			className={className}
		>
			{/* Shadow */}
			<ellipse
				cx="90"
				cy="148"
				rx="60"
				ry="8"
				className="fill-muted-foreground/8 dark:fill-muted-foreground/5"
			/>
			{/* Isometric board - back face */}
			<path
				d="M30 40 L90 10 L160 45 L100 75 Z"
				className="fill-muted/80 dark:fill-muted/40 stroke-border"
				strokeWidth="1.5"
				strokeLinejoin="round"
			/>
			{/* Board - front face */}
			<path
				d="M30 40 L100 75 L100 110 L30 75 Z"
				className="fill-muted dark:fill-muted/60 stroke-border"
				strokeWidth="1.5"
				strokeLinejoin="round"
			/>
			{/* Board - right face */}
			<path
				d="M100 75 L160 45 L160 80 L100 110 Z"
				className="fill-background stroke-border"
				strokeWidth="1.5"
				strokeLinejoin="round"
			/>
			{/* Content lines on the board surface - isometric */}
			{/* Row 1 */}
			<circle cx="62" cy="35" r="4" className="fill-primary/20" />
			<line
				x1="72"
				y1="33"
				x2="105"
				y2="17"
				className="stroke-muted-foreground/20"
				strokeWidth="4"
				strokeLinecap="round"
			/>
			<line
				x1="110"
				y1="15"
				x2="130"
				y2="5"
				className="stroke-muted-foreground/15"
				strokeWidth="4"
				strokeLinecap="round"
			/>
			{/* Row 2 */}
			<circle cx="55" cy="50" r="4" className="fill-primary/30" />
			<line
				x1="65"
				y1="48"
				x2="100"
				y2="31"
				className="stroke-muted-foreground/20"
				strokeWidth="4"
				strokeLinecap="round"
			/>
			<line
				x1="105"
				y1="29"
				x2="135"
				y2="14"
				className="stroke-muted-foreground/12"
				strokeWidth="4"
				strokeLinecap="round"
			/>
			{/* Row 3 */}
			<circle cx="48" cy="65" r="4" className="fill-destructive/25" />
			<line
				x1="58"
				y1="63"
				x2="88"
				y2="48"
				className="stroke-muted-foreground/18"
				strokeWidth="4"
				strokeLinecap="round"
			/>
		</svg>
	);
}
