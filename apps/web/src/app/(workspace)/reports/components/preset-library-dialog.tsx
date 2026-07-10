"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { StyledButton } from "@/components/ui/styled/styled-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
	Item,
	ItemContent,
	ItemDescription,
	ItemMedia,
	ItemTitle,
} from "@/components/ui/item";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Badge } from "@/components/reui/badge";
import { entityLabels } from "../report-config";
import {
	ALL_PRESET_CATEGORY,
	PRESET_CATEGORIES,
	PRESET_LIST,
	PRESET_TONE_BOX as TONE_BOX,
	type PresetCategoryId,
	type PresetListItem,
} from "../report-presets";

const scrollAreaScrollbarAutohide =
	"[&_[data-slot=scroll-area-scrollbar]]:opacity-0 [&_[data-slot=scroll-area-scrollbar]]:transition-opacity [&_[data-slot=scroll-area-scrollbar]]:duration-150 hover:[&_[data-slot=scroll-area-scrollbar]]:opacity-100";

const ALL_TONE_BOX = "bg-muted text-foreground";

const CATEGORY_TONE_BY_ID: Record<PresetCategoryId, string> = Object.fromEntries(
	PRESET_CATEGORIES.map((c) => [c.id, TONE_BOX[c.tone]])
) as Record<PresetCategoryId, string>;

interface PresetLibraryDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function PresetLibraryDialog({ open, onOpenChange }: PresetLibraryDialogProps) {
	const router = useRouter();
	const [activeCategory, setActiveCategory] = useState<string>(ALL_PRESET_CATEGORY);
	const [search, setSearch] = useState("");
	const [selectedId, setSelectedId] = useState<string | null>(null);

	// Escape-to-close; the app's other bespoke overlays (ClearWorkflowDialog)
	// rely on a backdrop click only, but this surface is bigger and has its
	// own scrollable panes, so Escape matters more here.
	useEffect(() => {
		if (!open) return;
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") onOpenChange(false);
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [open, onOpenChange]);

	const query = search.trim().toLowerCase();

	const visiblePresets = useMemo(() => {
		return PRESET_LIST.filter((preset) => {
			const matchesCategory =
				activeCategory === ALL_PRESET_CATEGORY || preset.categoryId === activeCategory;
			if (!matchesCategory) return false;
			if (!query) return true;
			const haystack = [
				preset.name,
				preset.description,
				entityLabels[preset.entityType] ?? preset.entityType,
			]
				.join(" ")
				.toLowerCase();
			return haystack.includes(query);
		});
	}, [activeCategory, query]);

	const selected = visiblePresets.find((p) => p.id === selectedId) ?? null;

	if (!open) return null;

	function close() {
		onOpenChange(false);
	}

	function goToPreset(id: string) {
		close();
		router.push(`/reports/new?preset=${id}`);
	}

	function goBlank() {
		close();
		router.push("/reports/new");
	}

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3"
			onClick={close}
		>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="preset-library-title"
				onClick={(e) => e.stopPropagation()}
				className="flex h-[min(86vh,48rem)] w-full max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl sm:max-w-3xl lg:max-w-4xl"
			>
				{/* Header */}
				<div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-4">
					<div>
						<h2 id="preset-library-title" className="text-lg font-semibold text-foreground">
							Start from a preset
						</h2>
						<p className="text-sm text-muted-foreground">
							Pick a ready-made report, then tailor it to fit.
						</p>
					</div>
					<button
						type="button"
						aria-label="Close dialog"
						onClick={close}
						className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
					>
						<X className="h-4 w-4" />
					</button>
				</div>

				<Separator className="shrink-0" />

				<div className="flex min-h-0 flex-1 flex-col lg:flex-row">
					{/* Category rail */}
					<aside className="flex max-h-[min(38svh,20rem)] min-h-0 shrink-0 flex-col overflow-hidden border-b border-border lg:max-h-none lg:w-64 lg:border-b-0 lg:border-r">
						<div className="px-5 pb-3 pt-4">
							<p className="text-xs font-medium text-muted-foreground">Categories</p>
						</div>
						<ScrollArea className={cn("h-full min-h-0 w-full flex-1", scrollAreaScrollbarAutohide)}>
							<RadioGroup
								value={activeCategory}
								onValueChange={setActiveCategory}
								aria-label="Preset category"
								className="flex flex-col gap-0.5 px-5 pb-3"
							>
								<Item
									render={<Label className="cursor-pointer" />}
									className={cn(
										"w-full min-w-0 cursor-pointer flex-nowrap items-center px-0.5 py-1.5 text-left transition-colors duration-150",
										activeCategory === ALL_PRESET_CATEGORY ? "bg-accent/50" : "hover:bg-accent/50"
									)}
								>
									<RadioGroupItem value={ALL_PRESET_CATEGORY} className="sr-only" />
									<ItemMedia className="self-center">
										<Item className={cn("size-9 items-center justify-center p-0", ALL_TONE_BOX)}>
											<LayoutGrid className="h-4 w-4" />
										</Item>
									</ItemMedia>
									<ItemContent className="min-w-0 flex-1 gap-0.5">
										<ItemTitle className="text-sm font-medium leading-tight">
											All presets
										</ItemTitle>
										<ItemDescription className="mt-0.5 text-xs text-muted-foreground">
											Every ready-made report
										</ItemDescription>
									</ItemContent>
								</Item>

								{PRESET_CATEGORIES.map((category) => {
									const isActive = category.id === activeCategory;
									const Icon = category.icon;
									return (
										<Item
											key={category.id}
											render={<Label className="cursor-pointer" />}
											className={cn(
												"w-full min-w-0 cursor-pointer flex-nowrap items-center px-0.5 py-1.5 text-left transition-colors duration-150",
												isActive ? "bg-accent/50" : "hover:bg-accent/50"
											)}
										>
											<RadioGroupItem value={category.id} className="sr-only" />
											<ItemMedia className="self-center">
												<Item
													className={cn(
														"size-9 items-center justify-center p-0",
														TONE_BOX[category.tone]
													)}
												>
													<Icon className="h-4 w-4" />
												</Item>
											</ItemMedia>
											<ItemContent className="min-w-0 flex-1 gap-0.5">
												<ItemTitle className="text-sm font-medium leading-tight">
													{category.label}
												</ItemTitle>
												<ItemDescription className="mt-0.5 text-xs text-muted-foreground">
													{category.note}
												</ItemDescription>
											</ItemContent>
										</Item>
									);
								})}
							</RadioGroup>
						</ScrollArea>
					</aside>

					{/* Search + preset list */}
					<div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
						<div className="shrink-0 px-5 pt-4">
							<Input
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								placeholder="Search presets..."
								aria-label="Search presets"
								autoComplete="off"
								autoFocus
							/>
						</div>

						<ScrollArea className={cn("min-h-0 flex-1", scrollAreaScrollbarAutohide)}>
							<div className="flex flex-col gap-2 px-5 pb-5">
								{visiblePresets.length === 0 ? (
									<div className="flex min-h-[280px] items-center justify-center">
										<Empty className="max-w-sm gap-2 rounded-none border-0 bg-transparent p-0 text-left md:p-0">
											<EmptyHeader className="items-start gap-2 text-left">
												<EmptyTitle className="text-base font-semibold tracking-tight">
													No presets match
												</EmptyTitle>
												<EmptyDescription className="text-sm/relaxed">
													Try a different search, or switch to another category.
												</EmptyDescription>
											</EmptyHeader>
										</Empty>
									</div>
								) : (
									visiblePresets.map((preset) => (
										<PresetRow
											key={preset.id}
											preset={preset}
											isSelected={preset.id === selectedId}
											onSelect={() => setSelectedId(preset.id)}
											onOpen={() => goToPreset(preset.id)}
										/>
									))
								)}
							</div>
						</ScrollArea>
					</div>
				</div>

				<Separator className="shrink-0" />

				{/* Footer */}
				<div className="flex shrink-0 flex-col-reverse items-center justify-between gap-3 px-5 py-4 sm:flex-row">
					<span className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground">
						<span className="shrink-0 whitespace-nowrap">
							{visiblePresets.length} {visiblePresets.length === 1 ? "preset" : "presets"}
						</span>
						{selected ? (
							<>
								<span aria-hidden className="size-1 shrink-0 rounded-full bg-muted-foreground/40" />
								<span className="min-w-0 truncate">{selected.name}</span>
							</>
						) : null}
					</span>

					<div className="flex items-center gap-2">
						<StyledButton intent="outline" size="sm" showArrow={false} onClick={goBlank}>
							Start blank
						</StyledButton>
						<StyledButton
							intent="primary"
							size="sm"
							disabled={!selected}
							onClick={() => {
								if (selected) goToPreset(selected.id);
							}}
						>
							Use preset
						</StyledButton>
					</div>
				</div>
			</div>
		</div>
	);
}

function PresetRow({
	preset,
	isSelected,
	onSelect,
	onOpen,
}: {
	preset: PresetListItem;
	isSelected: boolean;
	onSelect: () => void;
	onOpen: () => void;
}) {
	const Icon = preset.icon;
	return (
		<button
			type="button"
			onClick={onSelect}
			onDoubleClick={onOpen}
			className={cn(
				"flex w-full cursor-pointer items-start gap-3 rounded-lg border border-transparent p-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
				isSelected ? "border-border bg-accent/50" : "hover:bg-accent/50"
			)}
		>
			<div
				className={cn(
					"flex size-10 shrink-0 items-center justify-center rounded-lg",
					CATEGORY_TONE_BY_ID[preset.categoryId]
				)}
			>
				<Icon className="h-4.5 w-4.5" />
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex items-center justify-between gap-2">
					<p className="truncate font-medium text-foreground">{preset.name}</p>
					<Badge variant={isSelected ? "primary-light" : "outline"}>
						{entityLabels[preset.entityType] ?? preset.entityType}
					</Badge>
				</div>
				<p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{preset.description}</p>
			</div>
		</button>
	);
}
