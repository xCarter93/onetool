"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Send, Loader2, Globe, GlobeLock, Copy, Check, ExternalLink, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StyledButton } from "@/components/ui/styled/styled-button";
import { StyledBadge } from "@/components/ui/styled/styled-badge";
import { cn } from "@/lib/utils";
import { useCommunityPageForm, SECTION_LIST, type SectionId } from "./use-community-page-form";
import { MainSettingsSection } from "./sections/main-settings-section";
import { BioSection } from "./sections/bio-section";
import { GallerySection } from "./sections/gallery-section";
import { ServicesSection } from "./sections/services-section";
import { PricingSection } from "./sections/pricing-section";
import { BusinessInfoSection } from "./sections/business-info-section";
import { DesignSection } from "./sections/design-section";
import { PreviewModal } from "./preview-modal";

export default function CommunityEditContent() {
	const router = useRouter();
	const { mainSettings, design, businessInfo, bio, gallery, services, pricing, actions, activeSection, setActiveSection, sectionRefs, dirtyBySection, isLoading, isRedirecting } = useCommunityPageForm();
	const isPageLoaded = !isLoading && !isRedirecting;
	const [previewOpen, setPreviewOpen] = useState(false);

	// Stable sectionRef setters — created once so they don't break React.memo
	const sectionRefSetters = useMemo(() => {
		const setters = {} as Record<SectionId, (el: HTMLElement | null) => void>;
		for (const section of SECTION_LIST) {
			setters[section.id] = (el: HTMLElement | null) => { sectionRefs.current[section.id] = el; };
		}
		return setters;
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Sentinel-based sticky header detection
	const sentinelRef = useRef<HTMLDivElement>(null);
	const [isSticky, setIsSticky] = useState(false);

	useEffect(() => {
		const sentinel = sentinelRef.current;
		if (!sentinel) return;
		const observer = new IntersectionObserver(
			([entry]) => { setIsSticky(!entry.isIntersecting); },
			{ threshold: 0, rootMargin: "-72px 0px 0px 0px" },
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		if (!isPageLoaded) return;
		const visibleSections = new Set<string>();
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) visibleSections.add(entry.target.id);
					else visibleSections.delete(entry.target.id);
				}
				for (const section of SECTION_LIST) {
					if (visibleSections.has(section.id)) { setActiveSection(section.id); break; }
				}
			},
			{ root: null, rootMargin: "-180px 0px -35% 0px", threshold: [0, 0.15] },
		);
		for (const section of SECTION_LIST) {
			const element = sectionRefs.current[section.id];
			if (element) observer.observe(element);
		}
		return () => observer.disconnect();
	}, [isPageLoaded, setActiveSection, sectionRefs]);

	if (isLoading || isRedirecting) {
		return (
			<div className="flex items-center justify-center min-h-[400px]">
				<Loader2 className="size-8 animate-spin text-muted-fg" />
			</div>
		);
	}

	const publicUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/communities/${mainSettings.slug}`;

	return (
		<div className="relative min-h-screen bg-background">
			{/* Sentinel for sticky detection */}
			<div ref={sentinelRef} className="h-0 w-full" />

			{/* Sticky header bar — sticks to top-0, sits behind main nav (z-20 < z-30).
			    pt-12 pushes visible content below main nav's notched items on desktop. */}
			<div
				className={cn(
					"sticky top-0 z-20 bg-background transition-shadow duration-200 pt-10 md:pt-12",
					isSticky
						? "shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1)] border-b border-border/60"
						: "border-b border-border/60",
				)}
			>
				<div className="mx-auto px-4 sm:px-6 lg:px-8 py-4">
					<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
						<div className="flex items-center gap-4">
							<Button intent="outline" size="sq-sm" onPress={() => router.push("/community")} aria-label="Back to Community">
								<ArrowLeft className="size-4" />
							</Button>
							<div>
								<div className="flex items-center gap-3">
									<h1 className="text-xl font-bold text-fg">Edit Page</h1>
									{mainSettings.isPublic ? (
										<StyledBadge variant="success"><Globe className="size-3" />Live</StyledBadge>
									) : (
										<StyledBadge variant="warning"><GlobeLock className="size-3" />Private</StyledBadge>
									)}
								</div>
								{mainSettings.isPublic && (
									<div className="flex items-center gap-2 mt-1">
										<a href={publicUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-fg hover:text-fg font-mono flex items-center gap-1 transition-colors">
											{publicUrl}<ExternalLink className="size-3" />
										</a>
										<button onClick={mainSettings.handleCopyUrl} className="text-xs text-muted-fg hover:text-fg transition-colors">
											{mainSettings.copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
										</button>
									</div>
								)}
							</div>
						</div>
						<div className="flex items-center gap-3">
							<StyledButton
								intent="outline"
								size="sm"
								onClick={() => setPreviewOpen(true)}
							>
								<Eye className="size-4 mr-2" />
								Preview Page
							</StyledButton>
							{actions.hasUnsavedChanges && (
								<span className="text-sm font-medium text-amber-600 dark:text-amber-500 animate-pulse hidden sm:inline-block pr-2">Unsaved changes</span>
							)}
							{mainSettings.isPublic && (
								<StyledButton
									intent="warning"
									size="sm"
									onClick={mainSettings.handleMakePrivate}
								>
									<GlobeLock className="size-4 mr-2" />
									Make Private
								</StyledButton>
							)}
							{!mainSettings.isPublic && (
								<StyledButton
									intent="success"
									onClick={actions.handlePublish}
									disabled={actions.isSaving || actions.isPublishing || !actions.hasPublishableContent || !!actions.slugError || actions.isSlugAvailable === false || actions.hasInvalidSocialUrls}
								>
									{actions.isPublishing ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Send className="size-4 mr-2" />}
									Publish
								</StyledButton>
							)}
							<StyledButton
								intent={actions.hasUnsavedChanges ? "primary" : "secondary"}
								onClick={actions.handleSave}
								disabled={actions.isSaving || actions.isPublishing || !!actions.slugError || actions.isSlugAvailable === false || actions.hasInvalidSocialUrls || (!actions.hasUnsavedChanges && !mainSettings.isPublic)}
							>
								{actions.isSaving ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />}
								{mainSettings.isPublic ? "Save Changes" : "Save Draft"}
							</StyledButton>
						</div>
					</div>
				</div>
			</div>
			{/* Content area — pt-6 gives breathing room below sticky header */}
			<div className="mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8">
				<div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
					<div className="space-y-12 pb-[40vh]">
						<MainSettingsSection {...mainSettings} sectionRef={sectionRefSetters.mainSettings} />
						<DesignSection {...design} sectionRef={sectionRefSetters.design} />
						<BusinessInfoSection {...businessInfo} sectionRef={sectionRefSetters.businessInfo} />
						<BioSection {...bio} sectionRef={sectionRefSetters.bio} />
						<GallerySection {...gallery} sectionRef={sectionRefSetters.imageGallery} />
						<ServicesSection {...services} sectionRef={sectionRefSetters.services} />
						<PricingSection {...pricing} sectionRef={sectionRefSetters.pricing} />
					</div>
					<aside className="hidden lg:block">
						<div className="sticky top-40 rounded-xl border border-border/60 bg-background p-3">
							<nav className="space-y-1">
								{SECTION_LIST.map((section) => (
									<button key={section.id} type="button"
										onClick={() => sectionRefs.current[section.id]?.scrollIntoView({ behavior: "smooth", block: "start" })}
										className={cn(
											"w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-200 flex items-center justify-between",
											activeSection === section.id ? "bg-primary/10 text-primary font-medium ring-1 ring-primary/20 shadow-sm" : "text-muted-fg hover:bg-muted/40 hover:text-fg",
										)}
									>
										<span>{section.label}</span>
										{dirtyBySection[section.id] && <span className="size-2 rounded-full bg-amber-500" />}
									</button>
								))}
							</nav>
						</div>
					</aside>
				</div>
			</div>

			<PreviewModal
				open={previewOpen}
				onOpenChange={setPreviewOpen}
				pageTitle={mainSettings.pageTitle}
				bannerUrl={mainSettings.bannerUrl}
				avatarUrl={mainSettings.avatarUrl}
				organization={mainSettings.organization ? { name: mainSettings.organization.name, email: mainSettings.organization.email, phone: mainSettings.organization.phone, website: mainSettings.organization.website } : null}
				bioContent={bio.bioContent}
				servicesContent={services.servicesContent}
				pricingMode={pricing.pricingMode}
				pricingContent={pricing.pricingContent}
				pricingTiers={pricing.pricingTiers}
				galleryImages={gallery.galleryItems.filter(item => item.url).map(item => ({ url: item.url!, storageId: String(item.storageId), sortOrder: item.sortOrder }))}
				theme={design.theme}
				ownerInfo={businessInfo.ownerName || businessInfo.ownerTitle ? { name: businessInfo.ownerName || undefined, title: businessInfo.ownerTitle || undefined } : undefined}
				credentials={
					businessInfo.isLicensed || businessInfo.isBonded || businessInfo.isInsured || businessInfo.yearEstablished || businessInfo.certifications.length > 0
						? {
								isLicensed: businessInfo.isLicensed || undefined,
								isBonded: businessInfo.isBonded || undefined,
								isInsured: businessInfo.isInsured || undefined,
								yearEstablished: businessInfo.yearEstablished,
								certifications: businessInfo.certifications.length > 0 ? businessInfo.certifications : undefined,
							}
						: undefined
				}
				businessHours={{
					byAppointmentOnly: businessInfo.byAppointmentOnly,
					schedule: businessInfo.byAppointmentOnly ? undefined : businessInfo.businessSchedule,
				}}
				socialLinks={Object.values(businessInfo.socialLinks).some(Boolean) ? businessInfo.socialLinks : undefined}
			/>
		</div>
	);
}
