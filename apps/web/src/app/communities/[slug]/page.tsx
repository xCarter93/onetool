import { cache } from "react";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Mail, Phone, Globe } from "lucide-react";
import { getConvexClient } from "@/lib/convexClient";
import { api } from "@onetool/backend/convex/_generated/api";
import { CommunityPageContent } from "@/components/tiptap/community-editor";
import { GalleryCarousel } from "./gallery-carousel";
import { ContactForm } from "./contact-form";
import { cn } from "@/lib/utils";
import {
	ThemeWrapper,
	THEME_CLASSES,
	THEME_TYPOGRAPHY,
	getTheme,
} from "./components/theme-wrapper";
import { TrustBar } from "./components/trust-bar";
import { OwnerInfo } from "./components/owner-info";
import { SocialLinks } from "./components/social-links";
import { BusinessHoursCard } from "./components/business-hours-card";
import { FloatingCTA } from "./components/floating-cta";

interface PageProps {
	params: Promise<{ slug: string }>;
}

const getCommunityPage = cache(async (slug: string) => {
	const convex = getConvexClient();
	return convex.query(api.communityPages.getBySlug, { slug });
});

function buildLocalBusinessJsonLd(data: {
	pageTitle: string;
	metaDescription?: string;
	bannerUrl: string | null;
	avatarUrl: string | null;
	organization: {
		name: string;
		email?: string;
		phone?: string;
		website?: string;
	} | null;
}) {
	const ld: Record<string, unknown> = {
		"@context": "https://schema.org",
		"@type": "LocalBusiness",
		name: data.pageTitle,
	};

	if (data.metaDescription) ld.description = data.metaDescription;
	if (data.avatarUrl) ld.logo = data.avatarUrl;
	if (data.bannerUrl) ld.image = data.bannerUrl;
	if (data.organization?.email) ld.email = data.organization.email;
	if (data.organization?.phone) ld.telephone = data.organization.phone;
	if (data.organization?.website) ld.url = data.organization.website;

	return ld;
}

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { slug } = await params;
	const data = await getCommunityPage(slug);

	if (!data) {
		return { title: "Page Not Found" };
	}

	const ogImage =
		data.bannerUrl || data.avatarUrl || "https://onetool.biz/og-default.png";

	return {
		title: data.pageTitle,
		description: data.metaDescription || undefined,
		openGraph: {
			title: data.pageTitle,
			description:
				data.metaDescription || `${data.pageTitle} - Professional services`,
			type: "website",
			url: `https://onetool.biz/communities/${slug}`,
			images: [{ url: ogImage }],
		},
		twitter: {
			card: "summary_large_image",
			title: data.pageTitle,
			description: data.metaDescription || undefined,
			images: [ogImage],
		},
	};
}

export default async function PublicCommunityPage({ params }: PageProps) {
	const { slug } = await params;
	const data = await getCommunityPage(slug);

	if (!data) {
		notFound();
		return; // unreachable, helps TypeScript narrow the type
	}

	const galleryImages = data.galleryImages ?? [];
	const hasStructuredPricing =
		data.pricingMode === "structured" &&
		(data.pricingTiers?.length ?? 0) > 0;
	const hasSectionedContent =
		!!data.bioContent ||
		!!data.servicesContent ||
		hasStructuredPricing ||
		!!data.pricingContent ||
		galleryImages.length > 0;

	const theme = getTheme(data.theme as string | undefined);
	const themeClasses = THEME_CLASSES[theme];
	const themeTypo = THEME_TYPOGRAPHY[theme];

	return (
		<ThemeWrapper theme={theme}>
		<div className="min-h-screen bg-bg">
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{
					__html: JSON.stringify(buildLocalBusinessJsonLd(data)),
				}}
			/>

			{data.bannerUrl && (
				<div className="relative w-full h-56 sm:h-72 md:h-96 lg:h-[28rem]">
					<Image
						src={data.bannerUrl}
						alt={data.pageTitle}
						fill
						className="object-cover"
						priority
					/>
					<div className={cn("absolute inset-0 bg-gradient-to-t", themeClasses.heroOverlay)} />
					<div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-transparent" />
				</div>
			)}

			<div
				className={cn(
					"relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8",
					data.bannerUrl ? "-mt-32 sm:-mt-40" : "pt-16"
				)}
			>
				<div className="flex flex-col sm:flex-row items-center sm:items-end gap-6 sm:gap-8">
					{data.avatarUrl && (
						<div className="relative size-28 sm:size-36 md:size-40 rounded-3xl overflow-hidden border-4 border-bg shadow-2xl bg-bg ring-1 ring-black/5">
							<Image
								src={data.avatarUrl}
								alt={data.organization?.name || data.pageTitle}
								fill
								className="object-cover"
							/>
						</div>
					)}

					<div className="flex-1 text-center sm:text-left pb-4">
						<div
							className={cn(
								"inline-block",
								data.bannerUrl &&
									"backdrop-blur-md bg-black/40 px-6 py-4 rounded-2xl border border-white/20 shadow-lg"
							)}
						>
							<h1
								className={cn(
									themeTypo.display,
									"mb-3",
									data.bannerUrl
										? "text-white drop-shadow-md"
										: "text-fg"
								)}
							>
								{data.pageTitle}
							</h1>
							<OwnerInfo
								ownerInfo={
									data.ownerInfo as
										| { name?: string; title?: string }
										| undefined
								}
								bannerUrl={data.bannerUrl}
							/>
							{data.organization && (
								<div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-5 gap-y-2 text-sm">
									{data.organization.website && (
										<a
											href={
												data.organization.website.startsWith("http")
													? data.organization.website
													: `https://${data.organization.website}`
											}
											target="_blank"
											rel="noopener noreferrer"
											className={cn(
												"flex items-center gap-1.5 hover:text-primary transition-colors duration-200",
												data.bannerUrl
													? "text-gray-200 hover:text-white"
													: "text-muted-fg"
											)}
										>
											<Globe className="size-4" />
											<span className="font-medium">Website</span>
										</a>
									)}
									{data.organization.email && (
										<a
											href={`mailto:${data.organization.email}`}
											className={cn(
												"flex items-center gap-1.5 hover:text-primary transition-colors duration-200",
												data.bannerUrl
													? "text-gray-200 hover:text-white"
													: "text-muted-fg"
											)}
										>
											<Mail className="size-4" />
											<span>{data.organization.email}</span>
										</a>
									)}
									{data.organization.phone && (
										<a
											href={`tel:${data.organization.phone}`}
											className={cn(
												"flex items-center gap-1.5 hover:text-primary transition-colors duration-200",
												data.bannerUrl
													? "text-gray-200 hover:text-white"
													: "text-muted-fg"
											)}
										>
											<Phone className="size-4" />
											<span>{data.organization.phone}</span>
										</a>
									)}
								</div>
							)}
							<SocialLinks
								socialLinks={
									data.socialLinks as
										| {
												facebook?: string;
												instagram?: string;
												nextdoor?: string;
												youtube?: string;
												linkedin?: string;
												yelp?: string;
												google?: string;
										  }
										| undefined
								}
								bannerUrl={data.bannerUrl}
							/>
						</div>
					</div>
				</div>
			</div>

			<TrustBar
				credentials={
					data.credentials as
						| {
								isLicensed?: boolean;
								isBonded?: boolean;
								isInsured?: boolean;
								yearEstablished?: number;
								certifications?: string[];
						  }
						| undefined
				}
				themeClasses={themeClasses.trustBar}
			/>

			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
				<div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
					<div className="flex-1 min-w-0 space-y-10">
						{hasSectionedContent ? (
							<>
								{data.bioContent && (
									<section className="space-y-3">
										<h2 className={cn(themeTypo.heading, themeClasses.sectionHeading)}>
											Bio
										</h2>
										<div className="prose prose-slate dark:prose-invert max-w-none">
											<CommunityPageContent
												content={data.bioContent}
											/>
										</div>
									</section>
								)}

								{galleryImages.length > 0 && (
									<GalleryCarousel images={galleryImages} />
								)}

								{data.servicesContent && (
									<section className="space-y-3">
										<h2 className={cn(themeTypo.heading, themeClasses.sectionHeading)}>
											Services
										</h2>
										<div className="prose prose-slate dark:prose-invert max-w-none">
											<CommunityPageContent
												content={data.servicesContent}
											/>
										</div>
									</section>
								)}

								{(hasStructuredPricing || data.pricingContent) && (
									<section className="space-y-4">
										<h2 className={cn(themeTypo.heading, themeClasses.sectionHeading)}>
											Pricing
										</h2>
										{hasStructuredPricing ? (
											<div className="grid gap-4 md:grid-cols-2">
												{data.pricingTiers?.map((tier, index) => (
													<div
														key={`${tier.name}-${index}`}
														className={cn("rounded-xl p-5 space-y-2", themeClasses.card)}
													>
														<h3 className="text-lg font-semibold text-fg">
															{tier.name}
														</h3>
														<p className="text-2xl font-bold text-primary">
															{tier.price}
														</p>
														{tier.description && (
															<p className="text-sm text-muted-fg">
																{tier.description}
															</p>
														)}
													</div>
												))}
											</div>
										) : (
											data.pricingContent && (
												<div className="prose prose-slate dark:prose-invert max-w-none">
													<CommunityPageContent
														content={data.pricingContent}
													/>
												</div>
											)
										)}
									</section>
								)}
							</>
						) : (
							data.content && (
								<div className="prose prose-slate dark:prose-invert max-w-none">
									<CommunityPageContent content={data.content} />
								</div>
							)
						)}
					</div>

					<div className="lg:w-[380px] xl:w-[420px] flex-shrink-0" id="contact-form-section">
						<div className="lg:sticky lg:top-6">
							<ContactForm slug={slug} />
							<BusinessHoursCard
								businessHours={
									data.businessHours as
										| {
												byAppointmentOnly: boolean;
												schedule?: Array<{
													day: string;
													open: string;
													close: string;
													isClosed: boolean;
												}>;
										  }
										| undefined
								}
								cardClasses={themeClasses.card}
							/>
						</div>
					</div>
				</div>
			</div>

			<footer className="border-t border-border bg-muted/20 mt-auto">
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
					<div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-fg">
						<p>
							Powered by{" "}
							<a
								href="https://onetool.biz"
								target="_blank"
								rel="noopener noreferrer"
								className="text-primary hover:text-primary/80 font-medium transition-colors duration-200"
							>
								OneTool
							</a>
						</p>
						<div className="flex items-center gap-6">
							<Link
								href="/privacy-policy"
								className="hover:text-fg transition-colors duration-200"
							>
								Privacy Policy
							</Link>
							<Link
								href="/terms-of-service"
								className="hover:text-fg transition-colors duration-200"
							>
								Terms of Service
							</Link>
						</div>
					</div>
				</div>
			</footer>

			<FloatingCTA contactFormId="contact-form-section" />
		</div>
		</ThemeWrapper>
	);
}
