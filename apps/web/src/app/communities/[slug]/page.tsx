"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
	Loader2,
	Mail,
	Phone,
	Globe,
	Send,
	CheckCircle,
	AlertCircle,
	ChevronLeft,
	ChevronRight,
} from "lucide-react";
import type { JSONContent } from "@tiptap/react";

import { StyledInput } from "@/components/ui/styled/styled-input";
import {
	StyledCard,
	StyledCardHeader,
	StyledCardTitle,
	StyledCardDescription,
	StyledCardContent,
} from "@/components/ui/styled/styled-card";
import { StyledButton } from "@/components/ui/styled/styled-button";
import { Label } from "@/components/ui/label";
import { CommunityPageContent } from "@/components/tiptap/community-editor";
import { cn } from "@/lib/utils";

type PricingMode = "structured" | "richText";

interface CommunityPageData {
	slug: string;
	pageTitle: string;
	metaDescription?: string;
	content?: JSONContent;
	bioContent?: JSONContent;
	servicesContent?: JSONContent;
	pricingMode?: PricingMode;
	pricingContent?: JSONContent;
	pricingTiers?: Array<{
		name: string;
		price: string;
		description?: string;
	}>;
	galleryImages?: Array<{
		storageId: string;
		sortOrder: number;
		url: string;
	}>;
	bannerUrl: string | null;
	avatarUrl: string | null;
	organization: {
		name: string;
		email?: string;
		phone?: string;
		website?: string;
	} | null;
}

interface InterestFormState {
	name: string;
	email: string;
	phone: string;
}

export default function PublicCommunityPage() {
	const params = useParams();
	const slug = params.slug as string;

	const [pageData, setPageData] = useState<CommunityPageData | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [activeSlide, setActiveSlide] = useState(0);

	const [formState, setFormState] = useState<InterestFormState>({
		name: "",
		email: "",
		phone: "",
	});
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [submitSuccess, setSubmitSuccess] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);

	useEffect(() => {
		async function fetchPage() {
			try {
				const response = await fetch(`/api/communities/${slug}`);
				if (!response.ok) {
					if (response.status === 404) {
						setError("Page not found");
					} else {
						setError("Failed to load page");
					}
					return;
				}
				const data = await response.json();
				setPageData(data);
				setActiveSlide(0);
			} catch {
				setError("Failed to load page");
			} finally {
				setIsLoading(false);
			}
		}

		if (slug) {
			fetchPage();
		}
	}, [slug]);

	const galleryImages = pageData?.galleryImages ?? [];

	useEffect(() => {
		if (galleryImages.length <= 1) return;
		const timer = setInterval(() => {
			setActiveSlide((prev) => (prev + 1) % galleryImages.length);
		}, 4500);
		return () => clearInterval(timer);
	}, [galleryImages.length]);

	useEffect(() => {
		if (galleryImages.length === 0) {
			setActiveSlide(0);
		} else if (activeSlide >= galleryImages.length) {
			setActiveSlide(0);
		}
	}, [galleryImages.length, activeSlide]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsSubmitting(true);
		setSubmitError(null);

		try {
			const response = await fetch("/api/communities/interest", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					slug,
					name: formState.name,
					email: formState.email,
					phone: formState.phone || undefined,
				}),
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || "Submission failed");
			}

			setSubmitSuccess(true);
			setFormState({ name: "", email: "", phone: "" });
		} catch (err) {
			setSubmitError(err instanceof Error ? err.message : "Something went wrong");
		} finally {
			setIsSubmitting(false);
		}
	};

	if (isLoading) {
		return (
			<div className="min-h-screen flex items-center justify-center bg-bg">
				<Loader2 className="size-8 animate-spin text-muted-fg" />
			</div>
		);
	}

	if (error || !pageData) {
		return (
			<div className="min-h-screen flex flex-col items-center justify-center bg-bg px-4">
				<div className="text-center max-w-md">
					<AlertCircle className="size-16 text-muted-fg mx-auto mb-4" />
					<h1 className="text-2xl font-bold text-fg mb-2">
						{error || "Page not found"}
					</h1>
					<p className="text-muted-fg mb-6">
						This community page doesn&apos;t exist or is not publicly accessible.
					</p>
					<Link
						href="/"
						className="text-primary hover:text-primary/80 underline"
					>
						Go to homepage
					</Link>
				</div>
			</div>
		);
	}

	const hasStructuredPricing =
		pageData.pricingMode === "structured" && (pageData.pricingTiers?.length ?? 0) > 0;
	const hasSectionedContent =
		!!pageData.bioContent ||
		!!pageData.servicesContent ||
		hasStructuredPricing ||
		!!pageData.pricingContent ||
		galleryImages.length > 0;

	return (
		<div className="min-h-screen bg-bg">
			{pageData.bannerUrl && (
				<div className="relative w-full h-56 sm:h-72 md:h-96 lg:h-[28rem]">
					<Image
						src={pageData.bannerUrl}
						alt={pageData.pageTitle}
						fill
						className="object-cover"
						priority
					/>
					<div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/60 to-transparent" />
					<div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-transparent" />
				</div>
			)}

			<div
				className={cn(
					"relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8",
					pageData.bannerUrl ? "-mt-32 sm:-mt-40" : "pt-16"
				)}
			>
				<div className="flex flex-col sm:flex-row items-center sm:items-end gap-6 sm:gap-8">
					{pageData.avatarUrl && (
						<div className="relative size-28 sm:size-36 md:size-40 rounded-3xl overflow-hidden border-4 border-bg shadow-2xl bg-bg ring-1 ring-black/5">
							<Image
								src={pageData.avatarUrl}
								alt={pageData.organization?.name || pageData.pageTitle}
								fill
								className="object-cover"
							/>
						</div>
					)}

					<div className="flex-1 text-center sm:text-left pb-4">
						<div
							className={cn(
								"inline-block",
								pageData.bannerUrl &&
									"backdrop-blur-md bg-black/40 px-6 py-4 rounded-2xl border border-white/20 shadow-lg"
							)}
						>
							<h1
								className={cn(
									"text-3xl sm:text-4xl md:text-5xl font-bold mb-3",
									pageData.bannerUrl ? "text-white drop-shadow-md" : "text-fg"
								)}
							>
								{pageData.pageTitle}
							</h1>
							{pageData.organization && (
								<div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-5 gap-y-2 text-sm">
									{pageData.organization.website && (
										<a
											href={
												pageData.organization.website.startsWith("http")
													? pageData.organization.website
													: `https://${pageData.organization.website}`
											}
											target="_blank"
											rel="noopener noreferrer"
											className={cn(
												"flex items-center gap-1.5 hover:text-primary transition-colors duration-200",
												pageData.bannerUrl
													? "text-gray-200 hover:text-white"
													: "text-muted-fg"
											)}
										>
											<Globe className="size-4" />
											<span className="font-medium">Website</span>
										</a>
									)}
									{pageData.organization.email && (
										<a
											href={`mailto:${pageData.organization.email}`}
											className={cn(
												"flex items-center gap-1.5 hover:text-primary transition-colors duration-200",
												pageData.bannerUrl
													? "text-gray-200 hover:text-white"
													: "text-muted-fg"
											)}
										>
											<Mail className="size-4" />
											<span>{pageData.organization.email}</span>
										</a>
									)}
									{pageData.organization.phone && (
										<a
											href={`tel:${pageData.organization.phone}`}
											className={cn(
												"flex items-center gap-1.5 hover:text-primary transition-colors duration-200",
												pageData.bannerUrl
													? "text-gray-200 hover:text-white"
													: "text-muted-fg"
											)}
										>
											<Phone className="size-4" />
											<span>{pageData.organization.phone}</span>
										</a>
									)}
								</div>
							)}
						</div>
					</div>
				</div>
			</div>

			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
				<div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
					<div className="flex-1 min-w-0 space-y-10">
						{hasSectionedContent ? (
							<>
								{pageData.bioContent && (
									<section className="space-y-3">
										<h2 className="text-2xl font-semibold text-fg">Bio</h2>
										<div className="prose prose-slate dark:prose-invert max-w-none">
											<CommunityPageContent content={pageData.bioContent} />
										</div>
									</section>
								)}

								{galleryImages.length > 0 && (
									<section className="space-y-4">
										<div className="flex items-center justify-between gap-4">
											<h2 className="text-2xl font-semibold text-fg">Image Gallery</h2>
											{galleryImages.length > 1 && (
												<div className="flex items-center gap-2">
													<StyledButton
														intent="secondary"
														size="sm"
														onClick={() =>
															setActiveSlide(
																(prev) =>
																	(prev - 1 + galleryImages.length) %
																	galleryImages.length
															)
														}
													>
														<ChevronLeft className="size-4" />
													</StyledButton>
													<StyledButton
														intent="secondary"
														size="sm"
														onClick={() =>
															setActiveSlide((prev) => (prev + 1) % galleryImages.length)
														}
													>
														<ChevronRight className="size-4" />
													</StyledButton>
												</div>
											)}
										</div>
										<div className="relative rounded-2xl overflow-hidden border border-border/60 bg-muted/20 aspect-[16/10]">
											<Image
												src={galleryImages[activeSlide]?.url}
												alt={`Gallery image ${activeSlide + 1}`}
												fill
												className="object-cover"
											/>
										</div>
										{galleryImages.length > 1 && (
											<div className="flex items-center justify-center gap-2">
												{galleryImages.map((item, index) => (
													<button
														type="button"
														key={item.storageId}
														onClick={() => setActiveSlide(index)}
														className={cn(
															"h-2 rounded-full transition-all",
															index === activeSlide
																? "w-6 bg-primary"
																: "w-2 bg-muted-fg/40 hover:bg-muted-fg/70"
														)}
														aria-label={`Go to gallery image ${index + 1}`}
													/>
												))}
											</div>
										)}
									</section>
								)}

								{pageData.servicesContent && (
									<section className="space-y-3">
										<h2 className="text-2xl font-semibold text-fg">Services</h2>
										<div className="prose prose-slate dark:prose-invert max-w-none">
											<CommunityPageContent content={pageData.servicesContent} />
										</div>
									</section>
								)}

								{(hasStructuredPricing || pageData.pricingContent) && (
									<section className="space-y-4">
										<h2 className="text-2xl font-semibold text-fg">Pricing</h2>
										{hasStructuredPricing ? (
											<div className="grid gap-4 md:grid-cols-2">
												{pageData.pricingTiers?.map((tier, index) => (
													<div
														key={`${tier.name}-${index}`}
														className="rounded-xl border border-border/60 bg-card/40 p-5 space-y-2"
													>
														<h3 className="text-lg font-semibold text-fg">{tier.name}</h3>
														<p className="text-2xl font-bold text-primary">{tier.price}</p>
														{tier.description && (
															<p className="text-sm text-muted-fg">{tier.description}</p>
														)}
													</div>
												))}
											</div>
										) : (
											pageData.pricingContent && (
												<div className="prose prose-slate dark:prose-invert max-w-none">
													<CommunityPageContent content={pageData.pricingContent} />
												</div>
											)
										)}
									</section>
								)}
							</>
						) : (
							pageData.content && (
								<div className="prose prose-slate dark:prose-invert max-w-none">
									<CommunityPageContent content={pageData.content} />
								</div>
							)
						)}
					</div>

					<div className="lg:w-[380px] xl:w-[420px] flex-shrink-0">
						<div className="lg:sticky lg:top-6">
							<StyledCard>
								<StyledCardHeader className="space-y-2">
									<StyledCardTitle className="text-xl sm:text-2xl">
										Interested in our services?
									</StyledCardTitle>
									<StyledCardDescription>
										Leave your contact information and we&apos;ll get back to you
										soon.
									</StyledCardDescription>
								</StyledCardHeader>

								<StyledCardContent className="pt-4">
									{submitSuccess ? (
										<div className="flex flex-col items-center py-8 text-center">
											<div className="size-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
												<CheckCircle className="size-8 text-green-600 dark:text-green-400" />
											</div>
											<h3 className="text-xl font-semibold text-fg mb-2">
												Thank you!
											</h3>
											<p className="text-muted-fg text-sm">
												We&apos;ve received your information and will be in touch
												soon.
											</p>
										</div>
									) : (
										<form onSubmit={handleSubmit} className="space-y-4">
											<div className="space-y-2">
												<Label htmlFor="name" className="text-sm font-medium">
													Name <span className="text-danger">*</span>
												</Label>
												<StyledInput
													id="name"
													value={formState.name}
													onChange={(e) =>
														setFormState((s) => ({ ...s, name: e.target.value }))
													}
													placeholder="Your name"
													required
													minLength={2}
												/>
											</div>
											<div className="space-y-2">
												<Label htmlFor="email" className="text-sm font-medium">
													Email <span className="text-danger">*</span>
												</Label>
												<StyledInput
													id="email"
													type="email"
													value={formState.email}
													onChange={(e) =>
														setFormState((s) => ({ ...s, email: e.target.value }))
													}
													placeholder="your@email.com"
													required
												/>
											</div>
											<div className="space-y-2">
												<Label htmlFor="phone" className="text-sm font-medium">
													Phone <span className="text-muted-fg">(optional)</span>
												</Label>
												<StyledInput
													id="phone"
													type="tel"
													value={formState.phone}
													onChange={(e) =>
														setFormState((s) => ({ ...s, phone: e.target.value }))
													}
													placeholder="(555) 123-4567"
												/>
											</div>

											{submitError && (
												<div className="flex items-start gap-2 p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger">
													<AlertCircle className="size-4 flex-shrink-0 mt-0.5" />
													<span className="text-sm">{submitError}</span>
												</div>
											)}

											<StyledButton
												type="submit"
												intent="primary"
												size="md"
												className="w-full"
												disabled={isSubmitting}
												isLoading={isSubmitting}
												icon={!isSubmitting && <Send className="size-4" />}
											>
												{isSubmitting ? "Sending..." : "I'm Interested"}
											</StyledButton>
										</form>
									)}
								</StyledCardContent>
							</StyledCard>
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
		</div>
	);
}
