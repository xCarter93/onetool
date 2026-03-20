"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Send, Loader2, Globe, GlobeLock, Copy, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StyledButton } from "@/components/ui/styled/styled-button";
import { StyledBadge } from "@/components/ui/styled/styled-badge";
import { cn } from "@/lib/utils";
import { useCommunityPageForm, SECTION_LIST } from "./use-community-page-form";
import { MainSettingsSection } from "./sections/main-settings-section";
import { BioSection } from "./sections/bio-section";
import { GallerySection } from "./sections/gallery-section";
import { ServicesSection } from "./sections/services-section";
import { PricingSection } from "./sections/pricing-section";
import { BusinessInfoSection } from "./sections/business-info-section";

export default function CommunityEditContent() {
	const router = useRouter();
	const { mainSettings, businessInfo, bio, gallery, services, pricing, actions, activeSection, setActiveSection, sectionRefs, dirtyBySection, isLoading, isRedirecting } = useCommunityPageForm();
	const isPageLoaded = !isLoading && !isRedirecting;

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
		<div className="relative min-h-screen bg-bg">
			{/* Sentinel for sticky detection */}
			<div ref={sentinelRef} className="h-0 w-full" />

			{/* Blur strip to cover gap between main app header and edit header */}
			{isSticky && (
				<div
					className="sticky top-16 md:top-[72px] z-[25] h-[4px] bg-bg pointer-events-none"
					aria-hidden="true"
				/>
			)}

			{/* Sticky header bar — always sticky, sentinel controls visual treatment */}
			<div
				className={cn(
					"sticky top-16 md:top-[72px] z-20 transition-all duration-200",
					isSticky
						? "bg-bg/95 backdrop-blur-md shadow-md border-b border-border/60"
						: "bg-bg border-b border-border/60",
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
							{actions.hasUnsavedChanges && (
								<span className="text-sm font-medium text-amber-600 dark:text-amber-500 animate-pulse hidden sm:inline-block pr-2">Unsaved changes</span>
							)}
							<StyledButton
								intent={actions.hasUnsavedChanges ? "primary" : "secondary"}
								onClick={actions.handleSave}
								disabled={actions.isSaving || actions.isPublishing || !!actions.slugError || actions.isSlugAvailable === false || actions.hasInvalidSocialUrls || (!actions.hasUnsavedChanges && !mainSettings.isPublic)}
							>
								{actions.isSaving ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />}
								{mainSettings.isPublic ? "Save Changes" : "Save Draft"}
							</StyledButton>
							{!mainSettings.isPublic && (
								<StyledButton
									intent="primary"
									onClick={actions.handlePublish}
									disabled={actions.isSaving || actions.isPublishing || !actions.hasPublishableContent || !!actions.slugError || actions.isSlugAvailable === false || actions.hasInvalidSocialUrls}
								>
									{actions.isPublishing ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Send className="size-4 mr-2" />}
									Publish
								</StyledButton>
							)}
						</div>
					</div>
				</div>
			</div>
			{/* Content area */}
			<div className="mx-auto px-4 sm:px-6 lg:px-8 py-8">
				<div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
					<div className="space-y-12 pb-[40vh]">
						<MainSettingsSection {...mainSettings} sectionRef={(el) => { sectionRefs.current.mainSettings = el; }} />
						<BusinessInfoSection {...businessInfo} sectionRef={(el) => { sectionRefs.current.businessInfo = el; }} />
						<BioSection {...bio} sectionRef={(el) => { sectionRefs.current.bio = el; }} />
						<GallerySection {...gallery} sectionRef={(el) => { sectionRefs.current.imageGallery = el; }} />
						<ServicesSection {...services} sectionRef={(el) => { sectionRefs.current.services = el; }} />
						<PricingSection {...pricing} sectionRef={(el) => { sectionRefs.current.pricing = el; }} />
					</div>
					<aside className="hidden lg:block">
						<div className="sticky top-40 rounded-xl border border-border/60 bg-bg p-3">
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
		</div>
	);
}
