"use client";

import { PermissionGate } from "@/components/domain/permission-gate";
import React, { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import {
	Globe,
	ImageIcon,
	Send,
	Loader2,
	Clock,
	CheckCircle2,
	ExternalLink,
	Copy,
	Check,
	Pencil,
	Circle,
	Sparkles,
	Palette,
	BadgeCheck,
	FileText,
	Images,
	Wrench,
	Tags,
	ArrowRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
	InputGroupText,
} from "@/components/ui/input-group";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Frame,
	FramePanel,
	FrameHeader,
	FrameTitle,
	FrameDescription,
} from "@/components/reui/frame";
import { DotField } from "@/components/ui/dot-field";
import { NodesIllustration } from "./components/nodes-illustration";
import { StatusBadge } from "@/components/domain/status-badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Doc } from "@onetool/backend/convex/_generated/dataModel";
import { useOrganization } from "@clerk/nextjs";

const COPY_FEEDBACK_DURATION_MS = 2000;

type CommunityPageDoc = Doc<"communityPages">;

/** Mirrors the editor's SECTION_LIST ids so deep links land on the right section. */
const SECTION_CHECKLIST: Array<{
	id: string;
	label: string;
	blurb: string;
	icon: React.ComponentType<{ className?: string }>;
	isComplete: (page: CommunityPageDoc) => boolean;
}> = [
	{
		id: "mainSettings",
		label: "Branding & SEO",
		blurb: "Banner, logo, and search description",
		icon: Sparkles,
		isComplete: (p) =>
			!!p.bannerStorageId || !!p.avatarStorageId || !!p.metaDescription,
	},
	{
		id: "design",
		label: "Design",
		blurb: "Pick a visual theme",
		icon: Palette,
		isComplete: (p) => !!p.draftTheme,
	},
	{
		id: "businessInfo",
		label: "Business info",
		blurb: "Credentials, hours, and social links",
		icon: BadgeCheck,
		isComplete: (p) =>
			!!p.draftOwnerInfo ||
			!!p.draftCredentials ||
			!!p.draftBusinessHours ||
			!!p.draftSocialLinks,
	},
	{
		id: "bio",
		label: "Bio",
		blurb: "Tell your story",
		icon: FileText,
		isComplete: (p) => !!p.draftBioContent || !!p.draftContent,
	},
	{
		id: "imageGallery",
		label: "Gallery",
		blurb: "Show off your best work",
		icon: Images,
		isComplete: (p) => (p.galleryItemsDraft?.length ?? 0) > 0,
	},
	{
		id: "services",
		label: "Services",
		blurb: "What you offer",
		icon: Wrench,
		isComplete: (p) => !!p.draftServicesContent,
	},
	{
		id: "pricing",
		label: "Pricing",
		blurb: "Tiers or a custom write-up",
		icon: Tags,
		isComplete: (p) =>
			(p.draftPricingTiers?.length ?? 0) > 0 || !!p.draftPricingContent,
	},
];

const CREATE_PROOF_POINTS = [
	{
		icon: Globe,
		title: "A real web presence",
		description:
			"A polished public landing page for your business — no website builder required.",
	},
	{
		icon: ImageIcon,
		title: "Rich content",
		description:
			"Banner, photo gallery, services, pricing, credentials, and business hours.",
	},
	{
		icon: Send,
		title: "Leads, captured",
		description:
			"Visitors submit interest forms that land in your tasks automatically.",
	},
] as const;

function formatDate(timestamp?: number) {
	if (!timestamp) return null;
	return new Date(timestamp).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

function PageHeader({
	subtitle,
	children,
}: {
	subtitle: string;
	children?: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div className="flex items-center gap-3">
				<div className="h-6 w-1.5 rounded-full bg-linear-to-b from-primary to-primary/60" />
				<div>
					<h1 className="text-2xl font-bold text-foreground">Community</h1>
					<p className="text-sm text-muted-foreground">{subtitle}</p>
				</div>
			</div>
			{children}
		</div>
	);
}

/** Miniature browser-framed mock of the public page that live-mirrors the claim form. */
function GhostPreview({
	slug,
	pageTitle,
	orgName,
}: {
	slug: string;
	pageTitle: string;
	orgName?: string;
}) {
	const displayTitle = pageTitle || orgName || "Your Business";
	const initial = displayTitle.charAt(0).toUpperCase() || "B";
	return (
		<div className="relative w-full max-w-sm">
			<div className="rounded-xl border border-border/80 bg-background shadow-lg shadow-black/[0.06] overflow-hidden">
				{/* Browser chrome */}
				<div className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-3 py-2.5">
					<div className="flex gap-1.5" aria-hidden>
						<span className="size-2.5 rounded-full bg-border" />
						<span className="size-2.5 rounded-full bg-border" />
						<span className="size-2.5 rounded-full bg-border" />
					</div>
					<div className="ml-2 flex-1 truncate rounded-md bg-background border border-border/60 px-2.5 py-1 text-[11px] font-mono text-muted-foreground">
						onetool.biz/communities/
						<span className="text-foreground">{slug || "your-business"}</span>
					</div>
				</div>
				{/* Mock page body */}
				<div className="relative h-20">
					<DotField className="text-primary opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
				</div>
				<div className="px-5 pb-5">
					<div className="-mt-7 mb-3 flex size-14 items-center justify-center rounded-xl border-4 border-background bg-primary/15 text-lg font-bold text-primary">
						{initial}
					</div>
					<p className="truncate text-sm font-semibold text-foreground">
						{displayTitle}
					</p>
					<div className="mt-3 space-y-2" aria-hidden>
						<div className="h-2 w-4/5 rounded-full bg-muted" />
						<div className="h-2 w-3/5 rounded-full bg-muted" />
					</div>
					<div className="mt-4 grid grid-cols-3 gap-2" aria-hidden>
						<div className="aspect-square rounded-lg bg-muted/80" />
						<div className="aspect-square rounded-lg bg-muted/80" />
						<div className="aspect-square rounded-lg bg-muted/80" />
					</div>
					<div className="mt-4 flex gap-2" aria-hidden>
						<div className="h-7 flex-1 rounded-md bg-primary/80" />
						<div className="h-7 w-16 rounded-md bg-muted" />
					</div>
				</div>
			</div>
		</div>
	);
}

function HeroSkeleton() {
	return (
		<div className="space-y-8 p-6">
			<div className="flex items-center gap-3">
				<div className="h-6 w-1.5 rounded-full bg-muted" />
				<div className="space-y-2">
					<Skeleton className="h-6 w-40" />
					<Skeleton className="h-4 w-64" />
				</div>
			</div>
			<Skeleton className="h-56 w-full rounded-xl" />
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				{Array.from({ length: 4 }).map((_, i) => (
					<Skeleton key={i} className="h-20 rounded-xl" />
				))}
			</div>
		</div>
	);
}

function CommunityPageContent() {
	const router = useRouter();
	const toast = useToast();
	const { organization: clerkOrganization } = useOrganization();

	// Queries
	const communityPage = useQuery(api.communityPages.get);
	const organization = useQuery(api.organizations.get);
	const bannerUrl = useQuery(
		api.communityPages.getImageUrl,
		communityPage?.bannerStorageId
			? { storageId: communityPage.bannerStorageId }
			: "skip",
	);
	const avatarUrl = useQuery(
		api.communityPages.getImageUrl,
		communityPage?.avatarStorageId
			? { storageId: communityPage.avatarStorageId }
			: "skip",
	);

	// Mutations
	const upsert = useMutation(api.communityPages.upsert);

	// Form state for creation
	const [pageTitle, setPageTitle] = useState("");
	const [slug, setSlug] = useState("");
	const [slugError, setSlugError] = useState<string | null>(null);
	const [isCreating, setIsCreating] = useState(false);
	const [copied, setCopied] = useState(false);
	const [debouncedSlug, setDebouncedSlug] = useState("");

	// Reset the debounced value immediately when the slug is too short.
	if (slug.length < 3 && debouncedSlug !== "") {
		setDebouncedSlug("");
	}

	// Debounce slug for availability check
	useEffect(() => {
		if (slug.length < 3) return;
		const timer = setTimeout(() => setDebouncedSlug(slug), 300);
		return () => clearTimeout(timer);
	}, [slug]);

	const isSlugAvailable = useQuery(
		api.communityPages.checkSlugAvailable,
		debouncedSlug.length >= 3 ? { slug: debouncedSlug } : "skip",
	);

	// Initialize form from organization data once it loads (no community page yet).
	const [initializedOrgName, setInitializedOrgName] = useState<string | null>(
		null,
	);
	if (
		communityPage === null &&
		organization &&
		initializedOrgName !== organization.name
	) {
		const defaultSlug = organization.name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "")
			.substring(0, 50);
		setSlug(defaultSlug);
		setPageTitle(organization.name);
		setInitializedOrgName(organization.name);
	}

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

	const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
		setSlug(value);
		validateSlug(value);
	};

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

	const communitySlug = communityPage?.slug;
	const handleCopyUrl = useCallback(() => {
		if (!communitySlug) return;
		const url = `${window.location.origin}/communities/${communitySlug}`;
		navigator.clipboard.writeText(url);
		setCopied(true);
		setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION_MS);
		toast.success("URL copied", "Share this link with your audience");
	}, [communitySlug, toast]);

	const pageUrl = communityPage?.slug
		? `${typeof window !== "undefined" ? window.location.origin : ""}/communities/${communityPage.slug}`
		: "";

	// Loading state
	if (communityPage === undefined) {
		return <HeroSkeleton />;
	}

	// ------------------------------------------------------------------
	// No page yet — claim hero
	// ------------------------------------------------------------------
	if (communityPage === null) {
		const slugStatus =
			slug.length >= 3 && !slugError
				? debouncedSlug !== slug || isSlugAvailable === undefined
					? "checking"
					: isSlugAvailable
						? "available"
						: "taken"
				: null;

		return (
			<div className="space-y-8 p-6">
				<PageHeader subtitle="Claim a free public page for your business" />

				{/* Claim hero */}
				<Frame>
					<FramePanel className="p-0 overflow-hidden">
						<div className="grid items-stretch lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
							{/* Left: pitch + claim form */}
							<div className="space-y-7 px-7 py-8 sm:px-9">
								<div className="space-y-3">
									<NodesIllustration className="-ml-4 h-24 w-auto" />
									<span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
										<Globe className="size-3.5" />
										Your public page
									</span>
									<h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
										Put your business on the map
									</h2>
									<p className="max-w-lg text-sm/relaxed text-muted-foreground sm:text-base/relaxed">
										Claim a free public page that showcases your work, builds
										trust with credentials, and turns visitors into leads.
									</p>
								</div>

								<div className="max-w-lg space-y-5">
									<Field>
										<FieldLabel htmlFor="pageTitle">Page title</FieldLabel>
										<Input
											id="pageTitle"
											value={pageTitle}
											onChange={(e) => setPageTitle(e.target.value)}
											placeholder={organization?.name || "Your Business Name"}
										/>
									</Field>

									<Field>
										<FieldLabel htmlFor="slug">Page URL</FieldLabel>
										<InputGroup>
											<InputGroupAddon>
												<InputGroupText className="font-mono text-xs">
													onetool.biz/communities/
												</InputGroupText>
											</InputGroupAddon>
											<InputGroupInput
												id="slug"
												value={slug}
												onChange={handleSlugChange}
												placeholder="your-business-name"
												aria-invalid={
													!!slugError || slugStatus === "taken" || undefined
												}
											/>
											<InputGroupAddon align="inline-end">
												{slugStatus === "checking" && (
													<Loader2 className="size-4 animate-spin text-muted-foreground" />
												)}
												{slugStatus === "available" && (
													<span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
														<span className="size-1.5 rounded-full bg-emerald-500" />
														Available
													</span>
												)}
												{slugStatus === "taken" && (
													<span className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
														<span className="size-1.5 rounded-full bg-red-500" />
														Taken
													</span>
												)}
											</InputGroupAddon>
										</InputGroup>
										<FieldDescription>
											{slugError ??
												"Only lowercase letters, numbers, and hyphens allowed"}
										</FieldDescription>
									</Field>

									<Button
										variant="default"
										size="lg"
										className="w-full justify-center"
										onClick={handleCreatePage}
										disabled={
											isCreating ||
											!slug ||
											!!slugError ||
											isSlugAvailable === false
										}
									>
										{isCreating ? (
											<Loader2 className="size-4 mr-2 animate-spin" />
										) : (
											<Sparkles className="size-4 mr-2" />
										)}
										Claim your page
									</Button>

									<ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
										{[
											"Free on every plan",
											"Lead capture built in",
											"Live in minutes",
										].map((point) => (
											<li key={point} className="flex items-center gap-1.5">
												<Check className="size-3.5 text-primary" />
												{point}
											</li>
										))}
									</ul>
								</div>
							</div>

							{/* Right: live-mirroring ghost preview */}
							<div className="relative hidden items-center justify-center border-l border-border/60 bg-muted/40 p-8 lg:flex">
								<DotField className="text-primary opacity-[0.45] [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_78%)]" />
								<GhostPreview
									slug={slug}
									pageTitle={pageTitle}
									orgName={organization?.name}
								/>
							</div>
						</div>
					</FramePanel>
				</Frame>

				{/* Proof points */}
				<Frame className="grid gap-1 sm:grid-cols-3">
					{CREATE_PROOF_POINTS.map(({ icon: Icon, title, description }) => (
						<FramePanel key={title} className="p-5">
							<div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-primary/10">
								<Icon className="size-4.5 text-primary" />
							</div>
							<h3 className="text-sm font-semibold text-foreground">
								{title}
							</h3>
							<p className="mt-1 text-sm text-muted-foreground">
								{description}
							</p>
						</FramePanel>
					))}
				</Frame>
			</div>
		);
	}

	// ------------------------------------------------------------------
	// Page exists — profile hero (draft or live)
	// ------------------------------------------------------------------
	const isLive = communityPage.isPublic;
	const displayTitle =
		communityPage.pageTitle ||
		clerkOrganization?.name ||
		"Your Community Page";
	const completedSections = SECTION_CHECKLIST.filter((s) =>
		s.isComplete(communityPage),
	);
	const completionPct = Math.round(
		(completedSections.length / SECTION_CHECKLIST.length) * 100,
	);

	return (
		<div className="space-y-8 p-6">
			<PageHeader
				subtitle={
					isLive
						? "Your public page is live and collecting leads"
						: "Your public page is in draft — publish when ready"
				}
			>
				<div className="flex flex-wrap items-center gap-2.5">
					{isLive ? (
						<>
							<Button variant="ghost" size="sm" onClick={handleCopyUrl}>
								{copied ? (
									<>
										<Check className="size-4 mr-2 text-emerald-600" />
										Copied!
									</>
								) : (
									<>
										<Copy className="size-4 mr-2" />
										Copy link
									</>
								)}
							</Button>
							<a href={pageUrl} target="_blank" rel="noopener noreferrer">
								<Button variant="outline" size="sm">
									<ExternalLink className="size-4 mr-2" />
									View live
								</Button>
							</a>
							<Button
								variant="default"
								size="sm"
								onClick={() => router.push("/community/edit")}
							>
								<Pencil className="size-4 mr-2" />
								Edit page
							</Button>
						</>
					) : (
						<>
							<Button
								variant="outline"
								size="sm"
								onClick={() => router.push("/community/edit")}
							>
								<Pencil className="size-4 mr-2" />
								Edit page
							</Button>
							<Button
								variant="default"
								size="sm"
								onClick={() => router.push("/community/edit")}
							>
								<Send className="size-4 mr-2" />
								Publish to public
							</Button>
						</>
					)}
				</div>
			</PageHeader>

			{/* Profile hero */}
			<Frame>
				<FramePanel className="p-0 overflow-hidden">
					<DotField className="text-primary opacity-45 [mask-image:radial-gradient(120%_160%_at_100%_0%,black,transparent_75%)]" />
					{bannerUrl && (
						<div className="relative h-40 md:h-52">
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img
								src={bannerUrl}
								alt=""
								className="size-full object-cover"
							/>
						</div>
					)}

					{/* Identity row — text vertically centered; illustration card right */}
					<div className="relative flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between sm:p-7">
						<div
							className={cn(
								"flex gap-4 min-w-0",
								bannerUrl ? "items-end" : "items-center",
							)}
						>
							<div
								className={cn(
									"flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary/10 shadow-sm",
									bannerUrl &&
										"-mt-16 border-4 border-[var(--frame-panel-bg)]",
								)}
							>
								{avatarUrl ? (
									// eslint-disable-next-line @next/next/no-img-element
									<img
										src={avatarUrl}
										alt={`${displayTitle} logo`}
										className="size-full object-cover"
									/>
								) : (
									<span className="text-2xl font-bold text-primary">
										{displayTitle.charAt(0).toUpperCase()}
									</span>
								)}
							</div>
							<div className="min-w-0">
								<div className="flex items-center gap-3">
									<h2 className="truncate text-xl font-bold tracking-tight text-foreground sm:text-2xl">
										{displayTitle}
									</h2>
									{isLive ? (
										<StatusBadge
											role="success"
											appearance="soft"
											className="shrink-0 gap-1.5"
										>
											<span className="relative flex size-2">
												<span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" />
												<span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
											</span>
											Live
										</StatusBadge>
									) : (
										<StatusBadge
											role="warning"
											appearance="soft"
											className="shrink-0 gap-1.5"
										>
											<Clock className="size-3" />
											Draft
										</StatusBadge>
									)}
								</div>
								<div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
									{isLive ? (
										<a
											href={pageUrl}
											target="_blank"
											rel="noopener noreferrer"
											className="flex items-center gap-1 font-mono text-xs hover:text-foreground hover:underline transition-colors"
										>
											{pageUrl || `/communities/${communityPage.slug}`}
											<ExternalLink className="size-3" />
										</a>
									) : (
										<span className="font-mono text-xs">
											{pageUrl || `/communities/${communityPage.slug}`}
										</span>
									)}
									<span className="text-xs">
										{isLive
											? communityPage.publishedAt
												? `Published ${formatDate(communityPage.publishedAt)}`
												: "Published"
											: communityPage.updatedAt
												? `Updated ${formatDate(communityPage.updatedAt)}`
												: "Not yet published"}
									</span>
								</div>
							</div>
						</div>

						{/* Illustration card */}
						<div className="relative hidden shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-muted/30 px-14 py-7 md:flex">
							<DotField className="text-primary opacity-40 [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_80%)]" />
							<NodesIllustration className="relative h-36 w-auto" />
						</div>
					</div>
				</FramePanel>
			</Frame>

			{/* Section completeness */}
			<Frame>
				<FrameHeader className="flex-row items-center justify-between gap-4">
					<div>
						<FrameTitle>Page sections</FrameTitle>
						<FrameDescription>
							{completedSections.length === SECTION_CHECKLIST.length
								? "All sections filled in — your page is looking sharp."
								: `${completedSections.length} of ${SECTION_CHECKLIST.length} sections have content.`}
						</FrameDescription>
					</div>
					<div className="flex shrink-0 items-center gap-3">
						<Progress value={completionPct} className="w-28" />
						<span className="text-sm font-medium tabular-nums text-muted-foreground">
							{completionPct}%
						</span>
					</div>
				</FrameHeader>
				<div className="grid gap-1 sm:grid-cols-2 xl:grid-cols-4">
					{SECTION_CHECKLIST.map((section) => {
						const complete = section.isComplete(communityPage);
						const Icon = section.icon;
						return (
							<FramePanel
								key={section.id}
								className={cn("p-0", !complete && "border-dashed")}
							>
								<Link
									href={`/community/edit#${section.id}`}
									className="group flex h-full items-start gap-3 p-4 transition-colors hover:bg-accent/50"
								>
									<div
										className={cn(
											"flex size-8 shrink-0 items-center justify-center rounded-lg",
											complete
												? "bg-primary/10 text-primary"
												: "bg-muted text-muted-foreground",
										)}
									>
										<Icon className="size-4" />
									</div>
									<div className="min-w-0 flex-1">
										<p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
											{section.label}
											{complete ? (
												<CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
											) : (
												<Circle className="size-3.5 shrink-0 text-border" />
											)}
										</p>
										<p className="mt-0.5 truncate text-xs text-muted-foreground">
											{complete ? section.blurb : "Not added yet"}
										</p>
									</div>
									<ArrowRight className="size-3.5 shrink-0 self-center text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
								</Link>
							</FramePanel>
						);
					})}
					{/* Footer action panel completes the grid */}
					<FramePanel className="bg-primary/5 p-4">
						{isLive ? (
							<div className="flex h-full flex-col justify-between gap-3">
								<div>
									<p className="text-sm font-medium text-foreground">
										Share your page
									</p>
									<p className="mt-0.5 text-xs text-muted-foreground">
										Social media, business cards, email signatures.
									</p>
								</div>
								<Button
									variant="outline"
									size="sm"
									onClick={handleCopyUrl}
									className="w-full"
								>
									{copied ? (
										<Check className="size-4 mr-2 text-emerald-600" />
									) : (
										<Copy className="size-4 mr-2" />
									)}
									Copy link
								</Button>
							</div>
						) : (
							<div className="flex h-full flex-col justify-between gap-3">
								<div>
									<p className="text-sm font-medium text-foreground">
										Ready to go live?
									</p>
									<p className="mt-0.5 text-xs text-muted-foreground">
										Anyone with the link can view your page and submit
										interest forms.
									</p>
								</div>
								<Button
									variant="default"
									size="sm"
									onClick={() => router.push("/community/edit")}
									className="w-full"
								>
									<Send className="size-4 mr-2" />
									Publish to public
								</Button>
							</div>
						)}
					</FramePanel>
				</div>
			</Frame>
		</div>
	);
}

export default function CommunityPage() {
	return (
		<PermissionGate object="community">
			<CommunityPageContent />
		</PermissionGate>
	);
}
