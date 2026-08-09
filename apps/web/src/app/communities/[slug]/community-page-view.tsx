import { Fragment } from "react";
import Image from "next/image";
import type { JSONContent } from "@tiptap/react";
import Link from "next/link";
import { ArrowRight, Check, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import {
	hasRichTextContent,
	visibleSectionIds,
	type CommunitySectionId,
} from "@/lib/community-sections";
import { CommunityPageContent } from "@/components/tiptap/community-editor";
import { GalleryCarousel } from "./gallery-carousel";
import { ContactForm } from "./contact-form";
import { SiteHeader } from "./components/site-header";
import { MobileActionBar } from "./components/mobile-action-bar";
import { CredentialStrip } from "./components/credential-strip";
import { BusinessHoursCard } from "./components/business-hours-card";
import { SocialLinks } from "./components/social-links";
import { OwnerInfo } from "./components/owner-info";
import { ViewBeacon } from "./components/view-beacon";
import { EmptySectionHint } from "./components/empty-section-hint";

export const CONTACT_FORM_ID = "contact-form-section";

/**
 * Only sections a visitor would jump to get a nav anchor; "About us" is read on
 * the way past, not navigated to.
 */
const SECTION_ANCHORS: Partial<
	Record<CommunitySectionId, { id: string; label: string }>
> = {
	services: { id: "services", label: "Services" },
	pricing: { id: "pricing", label: "Pricing" },
	gallery: { id: "work", label: "Work" },
};

export interface CommunityPageViewData {
	slug: string;
	pageTitle: string;
	metaDescription?: string;
	content?: JSONContent;
	bioContent?: JSONContent;
	servicesContent?: JSONContent;
	serviceTags?: string[];
	sectionConfig?: Array<{ id: string; visible: boolean }>;
	pricingMode: "structured" | "richText";
	pricingContent?: JSONContent;
	pricingTiers?: Array<{
		name: string;
		price: string;
		description?: string;
		features?: string[];
		highlighted?: boolean;
	}>;
	galleryImages?: Array<{ storageId: string; sortOrder: number; url: string }>;
	ownerInfo?: { name?: string; title?: string };
	credentials?: {
		isLicensed?: boolean;
		isBonded?: boolean;
		isInsured?: boolean;
		yearEstablished?: number;
		certifications?: string[];
	};
	businessHours?: {
		byAppointmentOnly: boolean;
		schedule?: Array<{
			day: string;
			open: string;
			close: string;
			isClosed: boolean;
		}>;
	};
	socialLinks?: {
		facebook?: string;
		instagram?: string;
		nextdoor?: string;
		youtube?: string;
		linkedin?: string;
		yelp?: string;
		google?: string;
	};
	theme?: string;
	bannerUrl: string | null;
	avatarUrl: string | null;
	organization: {
		name: string;
		email?: string;
		phone?: string;
		website?: string;
		addressCity?: string;
		addressState?: string;
		timezone?: string;
	} | null;
}

interface CommunityPageViewProps {
	data: CommunityPageViewData;
	/**
	 * Draft previews render the same markup but must never let a visitor-facing
	 * action fire (no lead submission, no live links out).
	 */
	preview?: boolean;
	/**
	 * Editor-only. When supplied, sections that are switched on but empty render
	 * a callout in place instead of vanishing, and the callout jumps back to the
	 * field that fills them. The public page never passes this.
	 */
	onEditSection?: (sectionId: CommunitySectionId) => void;
}

function normalizeUrl(url: string): string {
	return url.startsWith("http") ? url : `https://${url}`;
}

/**
 * The public community page, as pure presentation. The published page, the
 * editor's preview, and the claim-flow ghost all render this same tree — only
 * the data source differs.
 */
export function CommunityPageView({
	data,
	preview,
	onEditSection,
}: CommunityPageViewProps) {
	const galleryImages = data.galleryImages ?? [];
	const pricingTiers = data.pricingTiers ?? [];
	const hasStructuredPricing =
		data.pricingMode === "structured" && pricingTiers.length > 0;

	// Master switch between the sectioned editor and the legacy single blob.
	// Pages authored before the sectioned editor still carry only `content`.
	const hasSectionedContent =
		!!data.bioContent ||
		!!data.servicesContent ||
		hasStructuredPricing ||
		!!data.pricingContent ||
		galleryImages.length > 0;

	const heroPhotos = galleryImages.slice(0, 3);
	const serviceArea = [
		data.organization?.addressCity,
		data.organization?.addressState,
	]
		.filter(Boolean)
		.join(", ");

	// A section renders only if it is switched on AND has something in it, so an
	// owner never publishes a bare heading over nothing.
	const sectionHasContent: Record<CommunitySectionId, boolean> = {
		bio: hasRichTextContent(data.bioContent),
		services: hasRichTextContent(data.servicesContent),
		pricing: hasStructuredPricing || hasRichTextContent(data.pricingContent),
		gallery: galleryImages.length > 0,
	};
	const orderedSections = visibleSectionIds(data.sectionConfig);
	const renderedSections = orderedSections.filter((id) => sectionHasContent[id]);

	// Anchors follow the same order the sections render in.
	const anchors = [
		...renderedSections.map((id) => SECTION_ANCHORS[id]),
		data.businessHours ? { id: "hours", label: "Hours" } : null,
	].filter((a): a is { id: string; label: string } => !!a);

	const sectionNodes: Record<CommunitySectionId, React.ReactNode> = {
		bio: data.bioContent ? (
			<section aria-labelledby="about-heading">
				<h2
					id="about-heading"
					className="text-2xl font-semibold tracking-tight text-fg"
				>
					About us
				</h2>
				<div className="mt-4 max-w-[68ch] text-fg">
					<CommunityPageContent content={data.bioContent} />
				</div>
			</section>
		) : null,
		services: data.servicesContent ? (
			<section id="services" aria-labelledby="services-heading" className="scroll-mt-20">
				<h2
					id="services-heading"
					className="text-2xl font-semibold tracking-tight text-fg"
				>
					What we do
				</h2>
				<div className="mt-4 max-w-[68ch] text-fg">
					<CommunityPageContent content={data.servicesContent} />
				</div>
			</section>
		) : null,
		pricing: (
			<section id="pricing" aria-labelledby="pricing-heading" className="scroll-mt-20">
				<h2
					id="pricing-heading"
					className="text-2xl font-semibold tracking-tight text-fg"
				>
					Plans &amp; pricing
				</h2>
				{hasStructuredPricing ? (
					<ul className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
						{pricingTiers.map((tier, index) => (
							<li
								key={`${tier.name}-${index}`}
								className={cn(
									"relative flex flex-col rounded-2xl border p-5",
									tier.highlighted
										? "border-primary bg-primary/5"
										: "border-border bg-bg"
								)}
							>
								{tier.highlighted && (
									<span className="absolute -top-2.5 left-5 rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-fg">
										Most chosen
									</span>
								)}
								<h3 className="text-base font-semibold text-fg">
									{tier.name}
								</h3>
								<p className="mt-1 text-2xl font-semibold tabular-nums text-fg">
									{tier.price}
								</p>
								{tier.description && (
									<p className="mt-2 text-sm text-muted-fg text-pretty">
										{tier.description}
									</p>
								)}
								{tier.features && tier.features.length > 0 && (
									<ul className="mt-4 space-y-2 border-t border-border pt-4">
										{tier.features.map((feature) => (
											<li
												key={feature}
												className="flex items-start gap-2 text-sm text-muted-fg"
											>
												<Check
													className="mt-0.5 size-4 shrink-0 text-success"
													aria-hidden="true"
												/>
												<span className="text-pretty">{feature}</span>
											</li>
										))}
									</ul>
								)}
							</li>
						))}
					</ul>
				) : (
					data.pricingContent && (
						<div className="mt-4 max-w-[68ch] text-fg">
							<CommunityPageContent content={data.pricingContent} />
						</div>
					)
				)}
			</section>
		),
		gallery: (
			<section id="work" className="scroll-mt-20">
				<GalleryCarousel
					images={galleryImages}
					businessName={data.pageTitle}
					headingClassName="text-2xl font-semibold tracking-tight text-fg"
				/>
			</section>
		),
	};

	return (
		<div className="min-h-screen bg-bg flex flex-col">
			<a
				href="#main"
				className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-fg"
			>
				Skip to content
			</a>

			<SiteHeader
				businessName={data.pageTitle}
				avatarUrl={data.avatarUrl}
				anchors={anchors}
				contactFormId={CONTACT_FORM_ID}
			/>

			<main id="main" className="flex-1">
				{/* Hero — name sits on the page, never in a glass box over the banner */}
				<section className="relative">
					{data.bannerUrl && (
						<div
							aria-hidden="true"
							className="absolute inset-x-0 top-0 h-64 sm:h-80 overflow-hidden"
						>
							<Image
								src={data.bannerUrl}
								alt=""
								fill
								className="object-cover opacity-15"
								priority
							/>
							<div className="absolute inset-0 bg-gradient-to-b from-transparent to-bg" />
						</div>
					)}

					<div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-12 sm:pt-14 sm:pb-16">
						<div
							className={cn(
								"grid gap-10",
								heroPhotos.length > 0 &&
									"lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-center"
							)}
						>
							<div>
								<h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-fg text-balance">
									{data.pageTitle}
								</h1>

								{data.metaDescription && (
									<p className="mt-4 text-base sm:text-lg leading-relaxed text-muted-fg max-w-xl text-pretty">
										{data.metaDescription}
									</p>
								)}

								<div className="mt-4">
									<OwnerInfo ownerInfo={data.ownerInfo} />
								</div>

								<div className="mt-7 flex flex-wrap items-center gap-3">
									<a
										href={`#${CONTACT_FORM_ID}`}
										className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-fg transition-colors duration-200 hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
									>
										Get a free quote
										<ArrowRight className="size-4" aria-hidden="true" />
									</a>
									{data.organization?.phone && (
										<a
											href={`tel:${data.organization.phone}`}
											className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-5 text-sm font-medium text-fg transition-colors duration-200 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
										>
											<Phone className="size-4" aria-hidden="true" />
											{data.organization.phone}
										</a>
									)}
								</div>

								<div className="mt-6">
									<SocialLinks socialLinks={data.socialLinks} />
								</div>
							</div>

							{/* Photos above the fold rather than buried mid-page */}
							{heroPhotos.length > 0 && (
								<div
									className={cn(
										"grid gap-2 sm:gap-3",
										heroPhotos.length === 1 && "grid-cols-1",
										heroPhotos.length === 2 && "grid-cols-2",
										heroPhotos.length >= 3 && "grid-cols-3"
									)}
								>
									<div
										className={cn(
											"relative aspect-4/3 overflow-hidden rounded-2xl ring-1 ring-border bg-muted",
											heroPhotos.length >= 3 && "col-span-2 row-span-2"
										)}
									>
										<Image
											src={heroPhotos[0].url}
											alt={`Recent work by ${data.pageTitle}`}
											fill
											className="object-cover"
											sizes="(max-width: 1024px) 100vw, 26rem"
											priority
										/>
									</div>
									{heroPhotos.slice(1).map((photo) => (
										<div
											key={photo.storageId}
											className={cn(
												"relative overflow-hidden rounded-xl ring-1 ring-border bg-muted",
												heroPhotos.length === 2
													? "aspect-4/3"
													: "aspect-square"
											)}
										>
											<Image
												src={photo.url}
												alt={`Recent work by ${data.pageTitle}`}
												fill
												className="object-cover"
												sizes="8rem"
											/>
										</div>
									))}
								</div>
							)}
						</div>
					</div>
				</section>

				<CredentialStrip
					credentials={data.credentials}
					businessHours={data.businessHours}
					serviceArea={serviceArea || undefined}
					timezone={data.organization?.timezone}
				/>

				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
					<div className="flex flex-col lg:flex-row gap-10 lg:gap-14">
						<div className="flex-1 min-w-0 space-y-14">
							{onEditSection ? (
								orderedSections.map((id) => (
									<Fragment key={id}>
										{sectionHasContent[id] ? (
											sectionNodes[id]
										) : (
											<EmptySectionHint
												sectionId={id}
												onEdit={onEditSection}
											/>
										)}
									</Fragment>
								))
							) : hasSectionedContent ? (
								renderedSections.map((id) => (
									<Fragment key={id}>{sectionNodes[id]}</Fragment>
								))
							) : data.content ? (
								<div className="max-w-[68ch] text-fg">
									<CommunityPageContent content={data.content} />
								</div>
							) : null}
						</div>

						<div
							id={CONTACT_FORM_ID}
							className="lg:w-[24rem] xl:w-[26rem] shrink-0 scroll-mt-20"
						>
							<div className="lg:sticky lg:top-20 space-y-6">
								{preview ? (
									<div className="rounded-2xl border border-border bg-muted/30 p-6 text-sm text-muted-fg">
										The quote request form appears here on the live page.
									</div>
								) : (
									<ContactForm slug={data.slug} serviceTags={data.serviceTags} />
								)}
								<div id="hours" className="scroll-mt-20">
									<BusinessHoursCard
										businessHours={data.businessHours}
										cardClasses="border border-border bg-bg"
									/>
								</div>
							</div>
						</div>
					</div>
				</div>
			</main>

			<footer className="border-t border-border bg-muted/20">
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 lg:pb-8">
					<div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-fg">
						<p>
							Powered by{" "}
							<a
								href="https://onetool.biz"
								target="_blank"
								rel="noopener noreferrer"
								className="font-medium text-primary transition-colors duration-200 hover:text-primary/80"
							>
								OneTool
							</a>
						</p>
						<div className="flex items-center gap-6">
							{data.organization?.website && (
								<a
									href={normalizeUrl(data.organization.website)}
									target="_blank"
									rel="noopener noreferrer"
									className="transition-colors duration-200 hover:text-fg"
								>
									Website
								</a>
							)}
							<Link
								href="/privacy-policy"
								className="transition-colors duration-200 hover:text-fg"
							>
								Privacy Policy
							</Link>
							<Link
								href="/terms-of-service"
								className="transition-colors duration-200 hover:text-fg"
							>
								Terms of Service
							</Link>
						</div>
					</div>
				</div>
			</footer>

			{!preview && (
				<>
					<MobileActionBar
						contactFormId={CONTACT_FORM_ID}
						phone={data.organization?.phone}
					/>
					{/* Draft previews must never inflate the owner's own view count. */}
					<ViewBeacon slug={data.slug} />
				</>
			)}
		</div>
	);
}
