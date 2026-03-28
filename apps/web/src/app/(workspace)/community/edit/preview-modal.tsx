"use client";

import { useEffect } from "react";
import Image from "next/image";
import { X, Mail, Phone, Globe } from "lucide-react";
import type { JSONContent } from "@tiptap/react";
import { cn } from "@/lib/utils";
import { CommunityPageContent } from "@/components/tiptap/community-editor";
import { GalleryCarousel } from "@/app/communities/[slug]/gallery-carousel";
import {
	THEME_CLASSES,
	THEME_TYPOGRAPHY,
	getTheme,
	ThemeWrapper,
} from "@/app/communities/[slug]/components/theme-wrapper";
import { TrustBar } from "@/app/communities/[slug]/components/trust-bar";
import { OwnerInfo } from "@/app/communities/[slug]/components/owner-info";
import { SocialLinks } from "@/app/communities/[slug]/components/social-links";
import { BusinessHoursCard } from "@/app/communities/[slug]/components/business-hours-card";

interface PreviewModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	pageTitle: string;
	bannerUrl: string | null;
	avatarUrl: string | null;
	organization: {
		name: string;
		email?: string;
		phone?: string;
		website?: string;
	} | null;
	bioContent: JSONContent | undefined;
	servicesContent: JSONContent | undefined;
	pricingMode: string;
	pricingContent: JSONContent | undefined;
	pricingTiers: Array<{ name: string; price: string; description: string }>;
	galleryImages: Array<{
		url: string | null;
		storageId: string;
		sortOrder: number;
	}>;
	theme: string;
	ownerInfo: { name?: string; title?: string } | undefined;
	credentials:
		| {
				isLicensed?: boolean;
				isBonded?: boolean;
				isInsured?: boolean;
				yearEstablished?: number;
				certifications?: string[];
		  }
		| undefined;
	businessHours:
		| {
				byAppointmentOnly: boolean;
				schedule?: Array<{
					day: string;
					open: string;
					close: string;
					isClosed: boolean;
				}>;
		  }
		| undefined;
	socialLinks:
		| {
				facebook?: string;
				instagram?: string;
				nextdoor?: string;
				youtube?: string;
				linkedin?: string;
				yelp?: string;
				google?: string;
		  }
		| undefined;
}

export function PreviewModal({
	open,
	onOpenChange,
	pageTitle,
	bannerUrl,
	avatarUrl,
	organization,
	bioContent,
	servicesContent,
	pricingMode,
	pricingContent,
	pricingTiers,
	galleryImages,
	theme: themeId,
	ownerInfo,
	credentials,
	businessHours,
	socialLinks,
}: PreviewModalProps) {
	// Lock background scroll when open
	useEffect(() => {
		if (!open) return;
		const original = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = original;
		};
	}, [open]);

	// Close on Escape
	useEffect(() => {
		if (!open) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape") onOpenChange(false);
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [open, onOpenChange]);

	if (!open) return null;

	const resolvedTheme = getTheme(themeId);
	const themeClasses = THEME_CLASSES[resolvedTheme];
	const themeTypo = THEME_TYPOGRAPHY[resolvedTheme];

	const validGalleryImages = galleryImages.filter(
		(img): img is { url: string; storageId: string; sortOrder: number } =>
			img.url !== null,
	);

	const hasStructuredPricing =
		pricingMode === "structured" && pricingTiers.length > 0;
	const hasSectionedContent =
		!!bioContent ||
		!!servicesContent ||
		hasStructuredPricing ||
		!!pricingContent ||
		validGalleryImages.length > 0;

	return (
		<div
			className="fixed inset-0 z-50 bg-background overflow-y-auto"
			role="dialog"
			aria-modal="true"
			aria-label="Page Preview"
		>
			{/* Header bar */}
			<div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-background border-b border-border/60 shadow-sm">
				<h2 className="text-base font-semibold text-fg">Page Preview</h2>
				<button
					onClick={() => onOpenChange(false)}
					className="rounded-lg p-1.5 text-muted-fg hover:text-fg hover:bg-muted/40 transition-colors"
					aria-label="Close preview"
				>
					<X className="size-5" />
				</button>
			</div>

			{/* Preview content -- mirrors public page layout */}
			<ThemeWrapper theme={resolvedTheme}>
				<div className="min-h-screen bg-bg">
					{/* Banner */}
					{bannerUrl && (
						<div className="relative w-full h-56 sm:h-72 md:h-96 lg:h-[28rem]">
							<Image
								src={bannerUrl}
								alt={pageTitle}
								fill
								className="object-cover"
							/>
							<div
								className={cn(
									"absolute inset-0 bg-gradient-to-t",
									themeClasses.heroOverlay,
								)}
							/>
							<div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-transparent" />
						</div>
					)}

					{/* Hero area */}
					<div
						className={cn(
							"relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8",
							bannerUrl ? "-mt-32 sm:-mt-40" : "pt-16",
						)}
					>
						<div className="flex flex-col sm:flex-row items-center sm:items-end gap-6 sm:gap-8">
							{avatarUrl && (
								<div className="relative size-28 sm:size-36 md:size-40 rounded-3xl overflow-hidden border-4 border-bg shadow-2xl bg-bg ring-1 ring-black/5">
									<Image
										src={avatarUrl}
										alt={
											organization?.name || pageTitle
										}
										fill
										className="object-cover"
									/>
								</div>
							)}

							<div className="flex-1 text-center sm:text-left pb-4">
								<div
									className={cn(
										"inline-block",
										bannerUrl &&
											"backdrop-blur-md bg-black/40 px-6 py-4 rounded-2xl border border-white/20 shadow-lg",
									)}
								>
									<h1
										className={cn(
											themeTypo.display,
											"mb-3",
											bannerUrl
												? "text-white drop-shadow-md"
												: "text-fg",
										)}
									>
										{pageTitle || "Your Business Name"}
									</h1>
									<OwnerInfo
										ownerInfo={ownerInfo}
										bannerUrl={bannerUrl}
									/>
									<SocialLinks
										socialLinks={socialLinks}
										bannerUrl={bannerUrl}
									/>
									{organization && (
										<div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-5 gap-y-2 text-sm">
											{organization.website && (
												<span
													className={cn(
														"flex items-center gap-1.5",
														bannerUrl
															? "text-gray-200"
															: "text-muted-fg",
													)}
												>
													<Globe className="size-4" />
													<span className="font-medium">
														Website
													</span>
												</span>
											)}
											{organization.email && (
												<span
													className={cn(
														"flex items-center gap-1.5",
														bannerUrl
															? "text-gray-200"
															: "text-muted-fg",
													)}
												>
													<Mail className="size-4" />
													<span>
														{organization.email}
													</span>
												</span>
											)}
											{organization.phone && (
												<span
													className={cn(
														"flex items-center gap-1.5",
														bannerUrl
															? "text-gray-200"
															: "text-muted-fg",
													)}
												>
													<Phone className="size-4" />
													<span>
														{organization.phone}
													</span>
												</span>
											)}
										</div>
									)}
								</div>
							</div>
						</div>
					</div>

					{/* Trust bar */}
					<TrustBar
						credentials={credentials}
						themeClasses={themeClasses.trustBar}
					/>

					{/* Content sections */}
					<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
						<div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
							<div className="flex-1 min-w-0 space-y-10">
								{hasSectionedContent ? (
									<>
										{bioContent && (
											<section className="space-y-3">
												<h2
													className={cn(
														"text-2xl font-semibold",
														themeClasses.sectionHeading,
													)}
												>
													Bio
												</h2>
												<div className="prose prose-slate dark:prose-invert max-w-none">
													<CommunityPageContent
														content={bioContent}
													/>
												</div>
											</section>
										)}

										{validGalleryImages.length > 0 && (
											<GalleryCarousel
												images={validGalleryImages}
											/>
										)}

										{servicesContent && (
											<section className="space-y-3">
												<h2
													className={cn(
														"text-2xl font-semibold",
														themeClasses.sectionHeading,
													)}
												>
													Services
												</h2>
												<div className="prose prose-slate dark:prose-invert max-w-none">
													<CommunityPageContent
														content={servicesContent}
													/>
												</div>
											</section>
										)}

										{(hasStructuredPricing ||
											pricingContent) && (
											<section className="space-y-4">
												<h2
													className={cn(
														"text-2xl font-semibold",
														themeClasses.sectionHeading,
													)}
												>
													Pricing
												</h2>
												{hasStructuredPricing ? (
													<div className="grid gap-4 md:grid-cols-2">
														{pricingTiers.map(
															(
																tier,
																index,
															) => (
																<div
																	key={`${tier.name}-${index}`}
																	className={cn(
																		"rounded-xl p-5 space-y-2",
																		themeClasses.card,
																	)}
																>
																	<h3 className="text-lg font-semibold text-fg">
																		{
																			tier.name
																		}
																	</h3>
																	<p className="text-2xl font-bold text-primary">
																		{
																			tier.price
																		}
																	</p>
																	{tier.description && (
																		<p className="text-sm text-muted-fg">
																			{
																				tier.description
																			}
																		</p>
																	)}
																</div>
															),
														)}
													</div>
												) : (
													pricingContent && (
														<div className="prose prose-slate dark:prose-invert max-w-none">
															<CommunityPageContent
																content={
																	pricingContent
																}
															/>
														</div>
													)
												)}
											</section>
										)}
									</>
								) : (
									<div className="text-center py-16 text-muted-fg">
										<p className="text-lg">
											Add content to see a preview of
											your page.
										</p>
									</div>
								)}
							</div>

							{/* Sidebar -- business hours (no contact form in preview) */}
							<div className="lg:w-[380px] xl:w-[420px] flex-shrink-0">
								<div className="lg:sticky lg:top-6 space-y-6">
									{/* Placeholder for contact form */}
									<div
										className={cn(
											"rounded-xl p-6 text-center",
											themeClasses.card,
										)}
									>
										<p className="text-sm font-medium text-muted-fg">
											Contact form will appear here
										</p>
									</div>

									<BusinessHoursCard
										businessHours={businessHours}
										cardClasses={themeClasses.card}
									/>
								</div>
							</div>
						</div>
					</div>

					{/* Footer */}
					<footer className="border-t border-border bg-muted/20 mt-auto">
						<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
							<div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-fg">
								<p>
									Powered by{" "}
									<span className="text-primary font-medium">
										OneTool
									</span>
								</p>
							</div>
						</div>
					</footer>
				</div>
			</ThemeWrapper>
		</div>
	);
}
