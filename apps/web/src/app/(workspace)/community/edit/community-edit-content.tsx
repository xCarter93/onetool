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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/reui/badge";
import { Frame, FramePanel } from "@/components/reui/frame";
import { Scrollspy } from "@/components/reui/scrollspy";
import { cn } from "@/lib/utils";
import { useCommunityPageForm, SECTION_LIST } from "./use-community-page-form";
import type { SectionId } from "./use-community-page-form";
import { MainSettingsSection } from "./sections/main-settings-section";
import { BioSection } from "./sections/bio-section";
import { GallerySection } from "./sections/gallery-section";
import { ServicesSection } from "./sections/services-section";
import { PricingSection } from "./sections/pricing-section";
import { BusinessInfoSection } from "./sections/business-info-section";
import { DesignSection } from "./sections/design-section";
import { PreviewModal } from "./preview-modal";

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
};

export default function CommunityEditContent() {
	const router = useRouter();
	const {
		mainSettings,
		design,
		businessInfo,
		bio,
		gallery,
		services,
		pricing,
		actions,
		sectionRefSetters,
		dirtyBySection,
		isLoading,
		isRedirecting,
	} = useCommunityPageForm();
	const isPageLoaded = !isLoading && !isRedirecting;
	const [previewOpen, setPreviewOpen] = useState(false);

	// The workspace card interior (.workspace-canvas) is the real scroller on
	// desktop; the window scrolls on mobile. Point Scrollspy at whichever is live.
	const scrollTargetRef = useRef<HTMLElement | Document | null>(null);
	useEffect(() => {
		const canvas = document.querySelector<HTMLElement>(".workspace-canvas");
		const mq = window.matchMedia("(min-width: 768px)");
		const update = () => {
			scrollTargetRef.current = mq.matches && canvas ? canvas : document;
		};
		update();
		mq.addEventListener("change", update);
		return () => mq.removeEventListener("change", update);
	}, []);

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
				<Loader2 className="size-8 animate-spin text-muted-fg" />
			</div>
		);
	}

	const publicUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/communities/${mainSettings.slug}`;

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
									<h1 className="text-xl font-bold text-fg truncate">
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
											className="text-xs text-muted-fg hover:text-fg font-mono flex items-center gap-1 transition-colors truncate"
										>
											{publicUrl}
											<ExternalLink className="size-3 shrink-0" />
										</a>
										<button
											onClick={mainSettings.handleCopyUrl}
											className="text-xs text-muted-fg hover:text-fg transition-colors"
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
									className="flex shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1.5 text-xs font-medium text-muted-fg transition-colors cursor-pointer data-[active=true]:border-primary/40 data-[active=true]:text-primary"
								>
									{section.label}
									{dirtyBySection[section.id] && (
										<span className="size-1.5 rounded-full bg-amber-500" />
									)}
								</button>
							))}
						</div>
					</div>

					<div className="grid gap-10 lg:grid-cols-[240px_minmax(0,1fr)]">
						{/* Desktop rail */}
						<aside className="hidden lg:block">
							<nav
								aria-label="Page sections"
								className="sticky top-40 space-y-0.5 rounded-xl border border-border/60 bg-card p-3 shadow-xs"
							>
								<p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-fg">
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
												"group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-muted-fg transition-colors cursor-pointer",
												"hover:bg-muted/40 hover:text-fg",
												"data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-medium",
											)}
										>
											<Icon className="size-4 shrink-0 opacity-70 group-data-[active=true]:opacity-100" />
											<span className="flex-1 truncate">{section.label}</span>
											{dirtyBySection[section.id] && (
												<span
													className="size-2 shrink-0 rounded-full bg-amber-500"
													title="Unsaved changes in this section"
												/>
											)}
										</button>
									);
								})}
							</nav>
						</aside>

						{/* Sections */}
						<div className="min-w-0 pb-[40vh]">
							<Frame>
								<FramePanel className="space-y-12 px-6 py-8 sm:px-8">
							<MainSettingsSection
								{...mainSettings}
								sectionRef={sectionRefSetters.mainSettings}
							/>
							<DesignSection {...design} sectionRef={sectionRefSetters.design} />
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
								</FramePanel>
							</Frame>
						</div>
					</div>
				</div>
			</Scrollspy>

			<PreviewModal
				open={previewOpen}
				onOpenChange={setPreviewOpen}
				pageTitle={mainSettings.pageTitle}
				bannerUrl={mainSettings.bannerUrl}
				avatarUrl={mainSettings.avatarUrl}
				organization={
					mainSettings.organization
						? {
								name: mainSettings.organization.name,
								email: mainSettings.organization.email,
								phone: mainSettings.organization.phone,
								website: mainSettings.organization.website,
							}
						: null
				}
				bioContent={bio.bioContent}
				servicesContent={services.servicesContent}
				pricingMode={pricing.pricingMode}
				pricingContent={pricing.pricingContent}
				pricingTiers={pricing.pricingTiers}
				galleryImages={gallery.galleryItems
					.filter((item) => item.url)
					.map((item) => ({
						url: item.url!,
						storageId: String(item.storageId),
						sortOrder: item.sortOrder,
					}))}
				theme={design.theme}
				ownerInfo={
					businessInfo.ownerName || businessInfo.ownerTitle
						? {
								name: businessInfo.ownerName || undefined,
								title: businessInfo.ownerTitle || undefined,
							}
						: undefined
				}
				credentials={
					businessInfo.isLicensed ||
					businessInfo.isBonded ||
					businessInfo.isInsured ||
					businessInfo.yearEstablished ||
					businessInfo.certifications.length > 0
						? {
								isLicensed: businessInfo.isLicensed || undefined,
								isBonded: businessInfo.isBonded || undefined,
								isInsured: businessInfo.isInsured || undefined,
								yearEstablished: businessInfo.yearEstablished,
								certifications:
									businessInfo.certifications.length > 0
										? businessInfo.certifications
										: undefined,
							}
						: undefined
				}
				businessHours={{
					byAppointmentOnly: businessInfo.byAppointmentOnly,
					schedule: businessInfo.byAppointmentOnly
						? undefined
						: businessInfo.businessSchedule,
				}}
				socialLinks={
					Object.values(businessInfo.socialLinks).some(Boolean)
						? businessInfo.socialLinks
						: undefined
				}
			/>
		</div>
	);
}
