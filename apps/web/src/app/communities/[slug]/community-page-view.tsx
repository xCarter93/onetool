import { Fragment } from "react";
import Image from "next/image";
import type { JSONContent } from "@tiptap/react";
import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveColorMode } from "@/lib/community-theme";
import { resolveAccent } from "@/lib/community-accent";
import { resolvePageLayout, type PageLayout } from "@/lib/community-layouts";
import {
	hasRichTextContent,
	sectionLayoutMap,
	visibleSectionIds,
	type CommunitySectionId,
} from "@/lib/community-sections";
import { CommunityPageContent } from "@/components/tiptap/community-editor";
import { GalleryCarousel } from "./gallery-carousel";
import { GalleryGrid } from "./gallery-grid";
import { ContactForm } from "./contact-form";
import { SiteHeader } from "./components/site-header";
import { MobileActionBar } from "./components/mobile-action-bar";
import { ViewBeacon } from "./components/view-beacon";
import type { LayoutBodyProps } from "./layouts/layout-body";
import { ShowcaseBody } from "./layouts/showcase-body";
import { StorefrontBody } from "./layouts/storefront-body";
import { DirectoryBody } from "./layouts/directory-body";
import { SITE_URL } from "@/lib/site-url";

export const CONTACT_FORM_ID = "contact-form-section";

/** Same content, three structures. The shell around them never changes. */
const LAYOUT_BODIES: Record<
	PageLayout,
	(props: LayoutBodyProps) => React.ReactNode
> = {
	showcase: ShowcaseBody,
	storefront: StorefrontBody,
	directory: DirectoryBody,
};

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
	faq: { id: "faq", label: "FAQ" },
};

export interface CommunityPageViewData {
	slug: string;
	pageTitle: string;
	metaDescription?: string;
	tagline?: string;
	content?: JSONContent;
	bioContent?: JSONContent;
	servicesContent?: JSONContent;
	serviceTags?: string[];
	sectionConfig?: Array<{ id: string; visible: boolean; layout?: string }>;
	pricingMode: "structured" | "richText";
	pricingContent?: JSONContent;
	pricingTiers?: Array<{
		name: string;
		price: string;
		description?: string;
		features?: string[];
		highlighted?: boolean;
	}>;
	faqItems?: Array<{ question: string; answer: string }>;
	teamMembers?: Array<{
		name: string;
		role?: string;
		bio?: string;
		photoUrl?: string;
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
	colorMode?: string;
	accent?: string;
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

/** Fallback for a team member with no photo; two letters, never more. */
function initialsOf(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "?";
	const first = parts[0][0] ?? "";
	const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
	return (first + last).toUpperCase();
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
	const faqItems = data.faqItems ?? [];
	const teamMembers = data.teamMembers ?? [];
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
		galleryImages.length > 0 ||
		faqItems.length > 0 ||
		teamMembers.length > 0;

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
		faq: faqItems.length > 0,
		team: teamMembers.length > 0,
	};
	const orderedSections = visibleSectionIds(data.sectionConfig);
	const layouts = sectionLayoutMap(data.sectionConfig);
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
					className="text-2xl font-semibold tracking-tight text-foreground"
				>
					About us
				</h2>
				<div className="mt-4 max-w-[68ch] text-foreground">
					<CommunityPageContent content={data.bioContent} />
				</div>
			</section>
		) : null,
		services: data.servicesContent ? (
			<section id="services" aria-labelledby="services-heading" className="scroll-mt-20">
				<h2
					id="services-heading"
					className="text-2xl font-semibold tracking-tight text-foreground"
				>
					What we do
				</h2>
				<div className="mt-4 max-w-[68ch] text-foreground">
					<CommunityPageContent content={data.servicesContent} />
				</div>
			</section>
		) : null,
		pricing: (
			<section id="pricing" aria-labelledby="pricing-heading" className="scroll-mt-20">
				<h2
					id="pricing-heading"
					className="text-2xl font-semibold tracking-tight text-foreground"
				>
					Plans &amp; pricing
				</h2>
				{hasStructuredPricing && layouts.pricing === "compact" ? (
					/* A price list, not a comparison: one row per plan, features
					   collapsed to a single line so a long menu stays scannable. */
					<ul className="mt-5 border-y border-border">
						{pricingTiers.map((tier, index) => (
							<li
								key={`${tier.name}-${index}`}
								className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1 border-b border-border py-4 last:border-b-0"
							>
								<div className="min-w-0 flex-1">
									<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
										<h3 className="text-base font-semibold text-foreground">
											{tier.name}
										</h3>
										{/* Solid, like the card variant. The accent is
										    owner-chosen and solved only against the page
										    background, so accent on an accent tint is the one
										    pairing the solver cannot guarantee. */}
										{tier.highlighted && (
											<span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
												Most chosen
											</span>
										)}
									</div>
									{tier.description && (
										<p className="mt-0.5 text-sm text-muted-foreground text-pretty">
											{tier.description}
										</p>
									)}
									{tier.features && tier.features.length > 0 && (
										<p className="mt-1 text-sm text-muted-foreground text-pretty">
											{tier.features.join(" · ")}
										</p>
									)}
								</div>
								<p className="shrink-0 text-lg font-semibold tabular-nums text-foreground">
									{tier.price}
								</p>
							</li>
						))}
					</ul>
				) : hasStructuredPricing ? (
					<ul className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
						{pricingTiers.map((tier, index) => (
							<li
								key={`${tier.name}-${index}`}
								className={cn(
									"relative flex flex-col rounded-2xl border p-5",
									tier.highlighted
										? "border-primary bg-primary/5"
										: "border-border bg-background"
								)}
							>
								{tier.highlighted && (
									<span className="absolute -top-2.5 left-5 rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
										Most chosen
									</span>
								)}
								<h3 className="text-base font-semibold text-foreground">
									{tier.name}
								</h3>
								<p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
									{tier.price}
								</p>
								{tier.description && (
									<p className="mt-2 text-sm text-muted-foreground text-pretty">
										{tier.description}
									</p>
								)}
								{tier.features && tier.features.length > 0 && (
									<ul className="mt-4 space-y-2 border-t border-border pt-4">
										{tier.features.map((feature) => (
											<li
												key={feature}
												className="flex items-start gap-2 text-sm text-muted-foreground"
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
						<div className="mt-4 max-w-[68ch] text-foreground">
							<CommunityPageContent content={data.pricingContent} />
						</div>
					)
				)}
			</section>
		),
		gallery: (
			<section id="work" className="scroll-mt-20">
				{layouts.gallery === "grid" ? (
					<GalleryGrid
						images={galleryImages}
						businessName={data.pageTitle}
						headingClassName="text-2xl font-semibold tracking-tight text-foreground"
					/>
				) : (
					<GalleryCarousel
						images={galleryImages}
						businessName={data.pageTitle}
						headingClassName="text-2xl font-semibold tracking-tight text-foreground"
					/>
				)}
			</section>
		),
		faq: (
			<section id="faq" aria-labelledby="faq-heading" className="scroll-mt-20">
				<h2
					id="faq-heading"
					className="text-2xl font-semibold tracking-tight text-foreground"
				>
					Common questions
				</h2>
				{/* Answers stay open. Someone scanning for "do you do weekends"
				    should find it by reading, not by opening four drawers. */}
				<dl className="mt-5 border-t border-border">
					{faqItems.map((item, index) => (
						<div
							key={`${item.question}-${index}`}
							className="border-b border-border py-5"
						>
							<dt className="text-base font-semibold text-foreground text-pretty">
								{item.question}
							</dt>
							<dd className="mt-2 max-w-[68ch] whitespace-pre-line text-sm leading-relaxed text-muted-foreground text-pretty">
								{item.answer}
							</dd>
						</div>
					))}
				</dl>
			</section>
		),
		team: (
			<section id="team" aria-labelledby="team-heading" className="scroll-mt-20">
				<h2
					id="team-heading"
					className="text-2xl font-semibold tracking-tight text-foreground"
				>
					Meet the team
				</h2>
				<ul className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
					{teamMembers.map((member, index) => (
						<li
							key={`${member.name}-${index}`}
							className="flex flex-col rounded-2xl border border-border bg-background p-5"
						>
							<div className="flex items-center gap-3">
								{member.photoUrl ? (
									<div className="relative size-14 shrink-0 overflow-hidden rounded-full border border-border/60 bg-muted/30">
										<Image
											src={member.photoUrl}
											alt=""
											fill
											sizes="56px"
											className="object-cover"
										/>
									</div>
								) : (
									<div
										aria-hidden="true"
										className="grid size-14 shrink-0 place-items-center rounded-full bg-muted text-base font-semibold text-muted-foreground"
									>
										{initialsOf(member.name)}
									</div>
								)}
								<div className="min-w-0">
									<p className="truncate text-base font-semibold text-foreground">
										{member.name}
									</p>
									{member.role && (
										<p className="truncate text-sm text-muted-foreground">
											{member.role}
										</p>
									)}
								</div>
							</div>
							{member.bio && (
								<p className="mt-3 text-sm leading-relaxed text-muted-foreground text-pretty">
									{member.bio}
								</p>
							)}
						</li>
					))}
				</ul>
			</section>
		),
	};

	const colorMode = resolveColorMode(data.colorMode);
	// The owner's brand colour, corrected for the background their mode renders.
	// Overriding the two variables here re-points every `bg-primary` /
	// `text-primary` / `border-primary` in the subtree, because the token block is
	// declared with `@theme inline` — the utility emits `var(--primary)` rather
	// than a copy captured at `:root`.
	const accent = resolveAccent(data.accent, colorMode);
	const layout = resolvePageLayout(data.theme);
	const LayoutBody = LAYOUT_BODIES[layout];

	// Built here rather than inside each layout: a draft preview must never be
	// able to submit a lead, and that guarantee should not depend on three
	// layouts each remembering it.
	const contactForm = preview ? (
		<div className="rounded-2xl border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
			The quote request form appears here on the live page.
		</div>
	) : (
		<ContactForm slug={data.slug} serviceTags={data.serviceTags} />
	);

	const layoutProps: LayoutBodyProps = {
		data,
		onEditSection,
		sectionNodes,
		orderedSections,
		renderedSections,
		sectionHasContent,
		hasSectionedContent,
		heroPhotos,
		serviceArea: serviceArea || undefined,
		contactForm,
	};


	return (
		<div
			className={cn("min-h-screen bg-background flex flex-col", colorMode)}
			style={
				{
					// Native controls — form inputs, scrollbars, autofill — read this
					// rather than our tokens, so a pinned page has to say which it is.
					colorScheme: colorMode,
					"--primary": accent.primary,
					"--primary-fg": accent.primaryFg,
				} as React.CSSProperties
			}
		>
			<a
				href="#main"
				className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
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
				<LayoutBody {...layoutProps} />
			</main>

			<footer className="border-t border-border bg-muted/20">
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 lg:pb-8">
					<div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
						<p>
							Powered by{" "}
							<a
								href={SITE_URL}
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
									className="transition-colors duration-200 hover:text-foreground"
								>
									Website
								</a>
							)}
							<Link
								href="/privacy-policy"
								className="transition-colors duration-200 hover:text-foreground"
							>
								Privacy Policy
							</Link>
							<Link
								href="/terms-of-service"
								className="transition-colors duration-200 hover:text-foreground"
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
