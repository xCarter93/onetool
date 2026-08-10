"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
	ArrowLeft,
	Save,
	Send,
	Loader2,
	GlobeLock,
	Copy,
	Check,
	ExternalLink,
	Eye,
	Sparkles,
	Palette,
	BadgeCheck,
	FileText,
	Images,
	Wrench,
	Tags,
	HelpCircle,
	Users,
	Check as CheckIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/reui/badge";
import { Scrollspy } from "@/components/reui/scrollspy";
import { cn } from "@/lib/utils";
import { useWorkspaceScrollTarget } from "@/lib/workspace-scroller";
import { useCommunityPageForm, SECTION_LIST } from "./use-community-page-form";
import type { SectionId } from "./use-community-page-form";
import { MainSettingsSection } from "./sections/main-settings-section";
import { BioSection } from "./sections/bio-section";
import { GallerySection } from "./sections/gallery-section";
import { ServicesSection } from "./sections/services-section";
import { PricingSection } from "./sections/pricing-section";
import { BusinessInfoSection } from "./sections/business-info-section";
import { DesignSection } from "./sections/design-section";
import { FaqSection } from "./sections/faq-section";
import { TeamSection } from "./sections/team-section";
import { PreviewModal } from "./preview-modal";
import { LivePreviewPane } from "./live-preview-pane";
import { buildPreviewData } from "./preview-data";
import type { CommunitySectionId } from "@/lib/community-sections";

/** Public section ids differ from the editor's own; the gallery is the only one. */
const EDITOR_SECTION_FOR: Record<CommunitySectionId, SectionId> = {
	bio: "bio",
	services: "services",
	pricing: "pricing",
	gallery: "imageGallery",
	faq: "faq",
	team: "team",
};

/** Sticky chrome is ~150px tall; scrollspy targets land just below it. */
const SCROLLSPY_OFFSET = 160;

const SECTION_ICONS: Record<
	SectionId,
	React.ComponentType<{ className?: string }>
> = {
	mainSettings: Sparkles,
	design: Palette,
	businessInfo: BadgeCheck,
	bio: FileText,
	imageGallery: Images,
	services: Wrench,
	pricing: Tags,
	faq: HelpCircle,
	team: Users,
};

/** Trailing rail state, most urgent first: unsaved beats a count beats done. */
function SectionIndicator({
	dirty,
	done,
	count,
}: {
	dirty: boolean;
	done: boolean;
	count?: string;
}) {
	if (dirty) {
		return (
			<span className="size-2 shrink-0 rounded-full bg-amber-500">
				<span className="sr-only">Unsaved changes</span>
			</span>
		);
	}
	if (count) {
		return (
			<span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
				{count}
			</span>
		);
	}
	if (done) {
		return (
			<>
				<CheckIcon className="size-3.5 shrink-0 text-success" aria-hidden />
				<span className="sr-only">Filled in</span>
			</>
		);
	}
	return (
		<span className="size-2 shrink-0 rounded-full border border-border">
			<span className="sr-only">Empty</span>
		</span>
	);
}

export default function CommunityEditContent() {
	const router = useRouter();
	const form = useCommunityPageForm();
	const {
		mainSettings,
		design,
		sections,
		businessInfo,
		bio,
		gallery,
		services,
		pricing,
		faq,
		team,
		actions,
		sectionRefSetters,
		dirtyBySection,
		sectionCompletion,
		isLoading,
		isRedirecting,
	} = form;
	const isPageLoaded = !isLoading && !isRedirecting;
	const [previewOpen, setPreviewOpen] = useState(false);

	// Point Scrollspy at whichever scroll context is live (workspace card on
	// desktop, window on mobile).
	const scrollTargetRef = useWorkspaceScrollTarget();

	// Sentinel-based sticky header detection
	const sentinelRef = useRef<HTMLDivElement>(null);
	const [isSticky, setIsSticky] = useState(false);

	useEffect(() => {
		if (!isPageLoaded) return;
		const sentinel = sentinelRef.current;
		if (!sentinel) return;
		const observer = new IntersectionObserver(
			([entry]) => {
				setIsSticky(!entry.isIntersecting);
			},
			{ threshold: 0, rootMargin: "-72px 0px 0px 0px" },
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	}, [isPageLoaded]);

	if (isLoading || isRedirecting) {
		return (
			<div className="flex items-center justify-center min-h-[400px]">
				<Loader2 className="size-8 animate-spin text-muted-foreground" />
			</div>
		);
	}

	const publicUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/communities/${mainSettings.slug}`;

	const previewData = buildPreviewData(form);

	// A callout in the preview jumps to the field that fills it, so the fix is
	// one click from where the problem showed up.
	const handleJumpToSection = (sectionId: CommunitySectionId) => {
		const prefersReducedMotion = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;
		document.getElementById(EDITOR_SECTION_FOR[sectionId])?.scrollIntoView({
			behavior: prefersReducedMotion ? "auto" : "smooth",
			block: "start",
		});
	};

	const saveDisabled =
		actions.isSaving ||
		actions.isPublishing ||
		!!actions.slugError ||
		actions.isSlugAvailable === false ||
		actions.isCheckingSlug ||
		actions.hasInvalidSocialUrls ||
		(!actions.hasUnsavedChanges && !mainSettings.isPublic);

	return (
		// No background here — the workspace canvas dot texture stays visible
		// across the whole page; content sits on opaque panels.
		// shrink-0 (and no min-h override) keeps this flex item at full content
		// height inside the fixed-height canvas; a shrunken root would end the
		// sticky header's containing block after ~one viewport.
		<div className="shrink-0">
			{/* Sentinel for sticky detection */}
			<div ref={sentinelRef} className="h-0 w-full" />

			{/* Sticky header bar — sticks to top-0, sits behind main nav (z-20 < z-30).
			    pt-12 pushes visible content below main nav's notched items on desktop. */}
			<div
				className={cn(
					"sticky top-0 z-20 bg-background transition-shadow duration-200 pt-10 md:pt-12 border-b border-border/60",
					isSticky && "shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1)]",
				)}
			>
				<div className="mx-auto px-4 sm:px-6 lg:px-8 py-4">
					<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
						<div className="flex items-center gap-4 min-w-0">
							<Button
								variant="outline"
								size="icon-sm"
								onClick={() => router.push("/community")}
								aria-label="Back to Community"
							>
								<ArrowLeft className="size-4" />
							</Button>
							<div className="min-w-0">
								<div className="flex items-center gap-3">
									<h1 className="text-xl font-bold text-foreground truncate">
										{mainSettings.pageTitle || "Edit Page"}
									</h1>
									{mainSettings.isPublic ? (
										<Badge variant="success" className="shrink-0">
											<span className="relative flex size-2" aria-hidden>
												<span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" />
												<span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
											</span>
											Live
										</Badge>
									) : (
										<Badge variant="warning" className="shrink-0">
											<GlobeLock className="size-3" />
											Private
										</Badge>
									)}
									{actions.hasUnsavedChanges && (
										<span
											className="size-2 shrink-0 rounded-full bg-amber-500"
											title="Unsaved changes"
										/>
									)}
								</div>
								{mainSettings.isPublic && (
									<div className="flex items-center gap-2 mt-1">
										<a
											href={publicUrl}
											target="_blank"
											rel="noopener noreferrer"
											className="text-xs text-muted-foreground hover:text-foreground font-mono flex items-center gap-1 transition-colors truncate"
										>
											{publicUrl}
											<ExternalLink className="size-3 shrink-0" />
										</a>
										<button
											onClick={mainSettings.handleCopyUrl}
											className="text-xs text-muted-foreground hover:text-foreground transition-colors"
											aria-label="Copy public URL"
										>
											{mainSettings.copied ? (
												<Check className="size-3 text-emerald-500" />
											) : (
												<Copy className="size-3" />
											)}
										</button>
									</div>
								)}
							</div>
						</div>
						<div className="flex items-center gap-2.5 shrink-0">
							<Button
								variant="outline"
								size="sm"
								onClick={() => setPreviewOpen(true)}
							>
								<Eye className="size-4 mr-2" />
								Preview
							</Button>
							{mainSettings.isPublic ? (
								<Button
									variant="outline"
									size="sm"
									onClick={mainSettings.handleMakePrivate}
								>
									<GlobeLock className="size-4 mr-2" />
									Make Private
								</Button>
							) : (
								<Button
									variant="default"
									size="sm"
									onClick={actions.handlePublish}
									disabled={
										actions.isSaving ||
										actions.isPublishing ||
										!actions.hasPublishableContent ||
										!!actions.slugError ||
										actions.isSlugAvailable === false ||
										actions.isCheckingSlug ||
										actions.hasInvalidSocialUrls
									}
								>
									{actions.isPublishing ? (
										<Loader2 className="size-4 mr-2 animate-spin" />
									) : (
										<Send className="size-4 mr-2" />
									)}
									Publish
								</Button>
							)}
							<Button
								variant={actions.hasUnsavedChanges ? "default" : "secondary"}
								size="sm"
								onClick={actions.handleSave}
								disabled={saveDisabled}
							>
								{actions.isSaving ? (
									<Loader2 className="size-4 mr-2 animate-spin" />
								) : (
									<Save className="size-4 mr-2" />
								)}
								{mainSettings.isPublic ? "Save Changes" : "Save Draft"}
							</Button>
						</div>
					</div>
				</div>
			</div>

			{/* Content area — scrollspy rail + stacked sections */}
			<Scrollspy targetRef={scrollTargetRef} offset={SCROLLSPY_OFFSET}>
				<div className="mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8">
					{/* Mobile section chips */}
					<div className="lg:hidden -mx-4 px-4 mb-6 overflow-x-auto">
						<div className="flex w-max gap-2 pb-1">
							{SECTION_LIST.map((section) => (
								<button
									key={section.id}
									type="button"
									data-scrollspy-anchor={section.id}
									className="flex shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors cursor-pointer data-[active=true]:border-primary/40 data-[active=true]:text-primary"
								>
									{section.label}
									{dirtyBySection[section.id] && (
										<span className="size-1.5 rounded-full bg-amber-500" />
									)}
								</button>
							))}
						</div>
					</div>

					{/* One surface, hairline-divided. Rail and preview stick inside it, so
					    neither column ever bottoms out onto bare canvas. */}
					<div className="rounded-xl border border-border/60 bg-card shadow-xs">
						<div className="grid lg:grid-cols-[220px_minmax(0,1fr)] 2xl:grid-cols-[220px_minmax(0,1fr)_minmax(400px,32%)]">
						{/* Desktop rail */}
						<aside className="hidden lg:block lg:border-r lg:border-border/60">
							<nav
								aria-label="Page sections"
								className="sticky top-40 space-y-0.5 p-3"
							>
								<p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
									Sections
								</p>
								{SECTION_LIST.map((section) => {
									const Icon = SECTION_ICONS[section.id];
									return (
										<button
											key={section.id}
											type="button"
											data-scrollspy-anchor={section.id}
											className={cn(
												"group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground transition-colors cursor-pointer",
												"hover:bg-muted/40 hover:text-foreground",
												"data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-medium",
											)}
										>
											<Icon className="size-4 shrink-0 opacity-70 group-data-[active=true]:opacity-100" />
											<span className="flex-1 truncate">{section.label}</span>
											<SectionIndicator
												dirty={dirtyBySection[section.id]}
												done={sectionCompletion[section.id].done}
												count={sectionCompletion[section.id].count}
											/>
										</button>
									);
								})}
							</nav>
						</aside>

						{/* Sections */}
						<div className="min-w-0 space-y-12 px-5 pt-8 pb-[40vh] sm:px-8">
							<MainSettingsSection
								{...mainSettings}
								sectionRef={sectionRefSetters.mainSettings}
							/>
							<DesignSection
								{...design}
								{...sections}
								logoUrl={mainSettings.avatarUrl}
								pricingMode={pricing.pricingMode}
								sectionRef={sectionRefSetters.design}
							/>
							<BusinessInfoSection
								{...businessInfo}
								sectionRef={sectionRefSetters.businessInfo}
							/>
							<BioSection {...bio} sectionRef={sectionRefSetters.bio} />
							<GallerySection
								{...gallery}
								sectionRef={sectionRefSetters.imageGallery}
							/>
							<ServicesSection
								{...services}
								sectionRef={sectionRefSetters.services}
							/>
							<PricingSection
								{...pricing}
								sectionRef={sectionRefSetters.pricing}
							/>
							<FaqSection {...faq} sectionRef={sectionRefSetters.faq} />
							<TeamSection {...team} sectionRef={sectionRefSetters.team} />
						</div>

						{/* Live preview. Third column only where there is room for one;
						    narrower than 2xl, the header's Preview button still opens
						    the full page. */}
						<aside className="hidden 2xl:block 2xl:border-l 2xl:border-border/60">
							<LivePreviewPane
								data={previewData}
								publicUrl={publicUrl}
								hasUnsavedChanges={actions.hasUnsavedChanges}
								onEditSection={handleJumpToSection}
							/>
						</aside>
						</div>
					</div>
				</div>
			</Scrollspy>

			<PreviewModal
				open={previewOpen}
				onOpenChange={setPreviewOpen}
				data={previewData}
			/>
		</div>
	);
}
