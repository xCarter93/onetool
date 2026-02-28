"use client";

import React, { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import {
	Globe,
	ImageIcon,
	Send,
	Loader2,
	Clock,
	CheckCircle2,
	ExternalLink,
	Edit,
	Copy,
	Check,
	Eye,
} from "lucide-react";

import { Label } from "@/components/ui/label";
import { StyledButton } from "@/components/ui/styled/styled-button";
import { StyledInput } from "@/components/ui/styled/styled-input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { api } from "@onetool/backend/convex/_generated/api";
import { useOrganization } from "@clerk/nextjs";

const COPY_FEEDBACK_DURATION_MS = 2000;

export default function CommunityPage() {
	const router = useRouter();
	const toast = useToast();
	const { organization: clerkOrganization } = useOrganization();

	// Queries
	const communityPage = useQuery(api.communityPages.get);
	const organization = useQuery(api.organizations.get);

	// Mutations
	const upsert = useMutation(api.communityPages.upsert);

	// Form state for creation
	const [pageTitle, setPageTitle] = useState("");
	const [slug, setSlug] = useState("");
	const [slugError, setSlugError] = useState<string | null>(null);
	const [isCreating, setIsCreating] = useState(false);
	const [copied, setCopied] = useState(false);
	const [debouncedSlug, setDebouncedSlug] = useState("");

	// Debounce slug for availability check
	useEffect(() => {
		if (slug.length < 3) {
			setDebouncedSlug("");
			return;
		}
		const timer = setTimeout(() => setDebouncedSlug(slug), 300);
		return () => clearTimeout(timer);
	}, [slug]);

	const isSlugAvailable = useQuery(
		api.communityPages.checkSlugAvailable,
		debouncedSlug.length >= 3 ? { slug: debouncedSlug } : "skip",
	);

	// Initialize form from organization data
	useEffect(() => {
		if (communityPage === null && organization) {
			const defaultSlug = organization.name
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/^-|-$/g, "")
				.substring(0, 50);
			setSlug(defaultSlug);
			setPageTitle(organization.name);
		}
	}, [communityPage, organization]);

	// Slug validation
	const validateSlug = useCallback((value: string) => {
		if (!/^[a-z0-9-]*$/.test(value)) {
			setSlugError("Only lowercase letters, numbers, and hyphens allowed");
			return false;
		}
		if (value.length < 3) {
			setSlugError("Slug must be at least 3 characters");
			return false;
		}
		if (value.length > 50) {
			setSlugError("Slug must be 50 characters or less");
			return false;
		}
		setSlugError(null);
		return true;
	}, []);

	// Handle slug change
	const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
		setSlug(value);
		validateSlug(value);
	};

	// Create initial community page
	const handleCreatePage = async () => {
		if (!validateSlug(slug)) return;

		setIsCreating(true);
		try {
			await upsert({
				slug,
				isPublic: false,
				pageTitle: pageTitle || undefined,
			});
			toast.success("Community page created", "Now customize your page");
			router.push("/community/edit");
		} catch (error) {
			toast.error(
				"Creation failed",
				error instanceof Error ? error.message : "Please try again",
			);
		} finally {
			setIsCreating(false);
		}
	};

	// Copy URL
	const handleCopyUrl = useCallback(() => {
		if (!communityPage?.slug) return;
		const url = `${window.location.origin}/communities/${communityPage.slug}`;
		navigator.clipboard.writeText(url);
		setCopied(true);
		setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION_MS);
		toast.success("URL copied", "Share this link with your audience");
	}, [communityPage?.slug, toast]);

	// Format date helper
	const formatDate = (timestamp?: number) => {
		if (!timestamp) return null;
		return new Date(timestamp).toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
	};

	const pageUrl = communityPage?.slug
		? `${typeof window !== "undefined" ? window.location.origin : ""}/communities/${communityPage.slug}`
		: "";

	// Loading state
	if (communityPage === undefined) {
		return (
			<div className="flex items-center justify-center min-h-[400px]">
				<Loader2 className="size-8 animate-spin text-muted-fg" />
			</div>
		);
	}

	// No community page exists - show creation prompt
	if (communityPage === null) {
		return (
			<div className="p-6 lg:p-8 space-y-12">
				{/* Header */}
				<div className="text-center space-y-4 mt-8">
					<div className="size-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
						<Globe className="size-8 text-primary" />
					</div>
					<div>
						<h1 className="text-3xl font-bold text-fg tracking-tight">
							Create Your Community Page
						</h1>
						<p className="text-muted-fg mt-3 max-w-md mx-auto text-base">
							Build a public page to showcase your business, share your
							services, and let potential customers express their interest.
						</p>
					</div>
				</div>

				{/* Benefits */}
				<div className="grid gap-6 sm:grid-cols-3">
					<div className="flex flex-col items-center text-center p-6 rounded-2xl bg-muted/20 border border-border/40">
						<div className="size-10 rounded-full bg-primary/10 flex items-center justify-center mb-4">
							<Globe className="size-5 text-primary" />
						</div>
						<h3 className="font-semibold text-fg mb-2">Online Presence</h3>
						<p className="text-sm text-muted-fg">
							Create a professional landing page for your business
						</p>
					</div>
					<div className="flex flex-col items-center text-center p-6 rounded-2xl bg-muted/20 border border-border/40">
						<div className="size-10 rounded-full bg-primary/10 flex items-center justify-center mb-4">
							<ImageIcon className="size-5 text-primary" />
						</div>
						<h3 className="font-semibold text-fg mb-2">Rich Content</h3>
						<p className="text-sm text-muted-fg">
							Add banners, images, and formatted content
						</p>
					</div>
					<div className="flex flex-col items-center text-center p-6 rounded-2xl bg-muted/20 border border-border/40">
						<div className="size-10 rounded-full bg-primary/10 flex items-center justify-center mb-4">
							<Send className="size-5 text-primary" />
						</div>
						<h3 className="font-semibold text-fg mb-2">Collect Leads</h3>
						<p className="text-sm text-muted-fg">
							Let visitors submit interest forms directly
						</p>
					</div>
				</div>

				<hr className="border-border/40" />

				{/* Setup Form */}
				<div className="max-w-xl mx-auto space-y-6">
					<div className="space-y-2">
						<Label htmlFor="pageTitle">Page Title</Label>
						<StyledInput
							id="pageTitle"
							value={pageTitle}
							onChange={(e) => setPageTitle(e.target.value)}
							placeholder={organization?.name || "Your Business Name"}
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="slug">Page URL</Label>
						<div className="flex items-center gap-3">
							<div className="flex">
								<div className="flex shrink-0 items-center rounded-l-md bg-muted/50 px-3 py-2 text-sm text-muted-fg border border-r-0 border-border">
									onetool.biz/communities/
								</div>
								<input
									id="slug"
									type="text"
									value={slug}
									onChange={handleSlugChange}
									placeholder="your-business-name"
									className={cn(
										"block w-full sm:w-48 rounded-r-md border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-muted-fg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent",
										slugError && "border-danger focus:ring-danger",
										!slugError &&
											isSlugAvailable === false &&
											"border-danger focus:ring-danger",
									)}
								/>
							</div>
							{slugError ? (
								<span className="text-sm text-danger">{slugError}</span>
							) : slug.length >= 3 &&
							  (debouncedSlug !== slug || isSlugAvailable === undefined) ? (
								<Loader2 className="size-4 animate-spin text-muted-fg" />
							) : slug.length >= 3 &&
							  debouncedSlug === slug &&
							  isSlugAvailable !== undefined ? (
								<div className="flex items-center gap-1.5">
									<span
										className={cn(
											"size-2 rounded-full",
											isSlugAvailable ? "bg-emerald-500" : "bg-red-500",
										)}
									/>
									<span
										className={cn(
											"text-sm font-medium",
											isSlugAvailable
												? "text-emerald-600 dark:text-emerald-400"
												: "text-red-600 dark:text-red-400",
										)}
									>
										{isSlugAvailable ? "Available" : "Taken"}
									</span>
								</div>
							) : null}
						</div>
						<p className="text-xs text-muted-fg">
							Only lowercase letters, numbers, and hyphens allowed
						</p>
					</div>

					{/* Create Button */}
					<div className="pt-6">
						<StyledButton
							intent="primary"
							className="w-full justify-center py-6 text-base"
							onClick={handleCreatePage}
							disabled={isCreating || !slug || !!slugError || isSlugAvailable === false}
						>
							{isCreating ? (
								<Loader2 className="size-5 mr-2 animate-spin" />
							) : (
								<Globe className="size-5 mr-2" />
							)}
							Create Community Page
						</StyledButton>
					</div>
				</div>
			</div>
		);
	}

	// Page exists but not public (draft)
	if (!communityPage.isPublic) {
		return (
			<div className="p-6 lg:p-8 space-y-8">
				<div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 border-b border-border/40 pb-6">
					<div className="space-y-2">
						<div className="flex items-center gap-3">
							<h1 className="text-2xl font-bold text-fg tracking-tight">
								Community Page
							</h1>
							<span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300">
								<Clock className="size-3" />
								Draft
							</span>
						</div>
						<p className="text-muted-fg text-sm">
							Your community page is set up but not yet visible to the public.
						</p>
					</div>
				</div>

				<div className="flex flex-col md:flex-row items-start gap-8 py-4">
					<div className="size-16 rounded-2xl bg-amber-100/50 dark:bg-amber-900/20 flex items-center justify-center shrink-0 border border-amber-200/50 dark:border-amber-800/30">
						<Globe className="size-8 text-amber-600 dark:text-amber-400" />
					</div>

					<div className="flex-1 space-y-2">
						<h3 className="text-xl font-semibold text-fg">
							{communityPage.pageTitle ||
								clerkOrganization?.name ||
								"Your Community Page"}
						</h3>
						<div className="flex items-center gap-2 text-sm text-muted-fg font-mono">
							<span>{pageUrl || `/communities/${communityPage.slug}`}</span>
						</div>
						{communityPage.updatedAt && (
							<p className="text-xs text-muted-fg pt-1">
								Last updated: {formatDate(communityPage.updatedAt)}
							</p>
						)}
					</div>

					<div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto mt-4 md:mt-0">
						<StyledButton
							intent="secondary"
							onClick={() => router.push("/community/edit")}
							className="w-full sm:w-auto"
						>
							<Edit className="size-4 mr-2" />
							Edit Page
						</StyledButton>
						<StyledButton
							intent="primary"
							onClick={() => router.push("/community/edit")}
							className="w-full sm:w-auto"
						>
							<Eye className="size-4 mr-2" />
							Publish to Public
						</StyledButton>
					</div>
				</div>

				<div className="rounded-xl border border-border/40 bg-muted/20 p-5 mt-4">
					<p className="text-sm text-muted-fg flex items-center gap-2">
						<strong className="text-fg font-medium">Ready to go live?</strong>
						Once you make your page public, anyone with the link can view it and
						submit interest forms.
					</p>
				</div>
			</div>
		);
	}

	// Page exists and is public
	return (
		<div className="p-6 lg:p-8 space-y-8">
			<div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 border-b border-border/40 pb-6">
				<div className="space-y-2">
					<div className="flex items-center gap-3">
						<h1 className="text-2xl font-bold text-fg tracking-tight">
							Community Page
						</h1>
						<span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300">
							<CheckCircle2 className="size-3" />
							Live
						</span>
					</div>
					<p className="text-muted-fg text-sm">
						Your community page is live and accessible to anyone with the link.
					</p>
				</div>
			</div>

			<div className="flex flex-col md:flex-row items-start gap-8 py-4">
				<div className="size-16 rounded-2xl bg-emerald-100/50 dark:bg-emerald-900/20 flex items-center justify-center shrink-0 border border-emerald-200/50 dark:border-emerald-800/30">
					<Globe className="size-8 text-emerald-600 dark:text-emerald-400" />
				</div>

				<div className="flex-1 space-y-2">
					<h3 className="text-xl font-semibold text-fg">
						{communityPage.pageTitle ||
							clerkOrganization?.name ||
							"Your Community Page"}
					</h3>
					<div className="flex items-center gap-2 text-sm text-muted-fg font-mono">
						<a
							href={pageUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="hover:text-fg hover:underline transition-colors flex items-center gap-1"
						>
							{pageUrl}
							<ExternalLink className="size-3" />
						</a>
					</div>
					{communityPage.publishedAt && (
						<p className="text-xs text-muted-fg pt-1">
							Published: {formatDate(communityPage.publishedAt)}
						</p>
					)}
				</div>

				<div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto mt-4 md:mt-0">
					<StyledButton
						intent="plain"
						onClick={handleCopyUrl}
						className="w-full sm:w-auto"
					>
						{copied ? (
							<>
								<Check className="size-4 mr-2 text-emerald-600" />
								Copied!
							</>
						) : (
							<>
								<Copy className="size-4 mr-2" />
								Copy Link
							</>
						)}
					</StyledButton>
					<StyledButton
						intent="secondary"
						onClick={() => router.push("/community/edit")}
						className="w-full sm:w-auto"
					>
						<Edit className="size-4 mr-2" />
						Edit Page
					</StyledButton>
					<a
						href={pageUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="w-full sm:w-auto"
					>
						<StyledButton intent="primary" className="w-full sm:w-auto">
							<ExternalLink className="size-4 mr-2" />
							View Live
						</StyledButton>
					</a>
				</div>
			</div>

			<div className="rounded-xl border border-border/40 bg-muted/20 p-5 mt-4">
				<p className="text-sm text-muted-fg">
					<strong className="text-fg font-medium">Tip:</strong> Share your
					community page link on social media, business cards, or email
					signatures to attract potential customers and generate leads.
				</p>
			</div>
		</div>
	);
}
