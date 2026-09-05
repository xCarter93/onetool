"use client";

import React, {
	useCallback,
	useEffect,
	useRef,
	useState,
	useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import {
	Globe,
	ImageIcon,
	Send,
	Loader2,
	ExternalLink,
	Check,
	Pencil,
	Sparkles,
	QrCode,
} from "lucide-react";

import { hasRichTextContent } from "@/lib/community-sections";
import { copyToClipboard } from "@/lib/clipboard";
import {
	PAGE_LAYOUT_LABELS,
	resolvePageLayout,
} from "@/lib/community-layouts";
import { PermissionGate } from "@/components/domain/permission-gate";
import { LearnMoreLink } from "@/components/help/learn-more";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
	InputGroupText,
} from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Frame, FramePanel } from "@/components/reui/frame";
import { DotField } from "@/components/ui/dot-field";
import { Illustration } from "@/components/illustrations";
import { useToast } from "@/hooks/use-toast";
import { useOrgToday } from "@/hooks/use-org-today";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Doc } from "@onetool/backend/convex/_generated/dataModel";
import { useOrganization } from "@clerk/nextjs";

import { ShareKitDialog } from "./components/share-kit-dialog";
import { RequestsTable, type RequestFilter } from "./components/requests-table";
import { PageCard, type SetupStep } from "./components/page-card";
import {
	PerformancePanel,
	type RangeDays,
} from "./components/performance-panel";

const COPY_FEEDBACK_DURATION_MS = 2000;

const minuteFloor = () => Math.floor(Date.now() / 60_000) * 60_000;

type CommunityPageDoc = Doc<"communityPages">;

/**
 * Mirrors the editor's SECTION_LIST ids so deep links land on the right
 * section. `todo` is what the owner still has to do, phrased as the action.
 */
const SECTION_CHECKLIST: Array<{
	id: string;
	todo: string;
	isComplete: (page: CommunityPageDoc) => boolean;
}> = [
	{
		id: "mainSettings",
		todo: "Add a banner and a search description",
		isComplete: (p) =>
			!!p.bannerStorageId || !!p.avatarStorageId || !!p.metaDescription,
	},
	{
		id: "businessInfo",
		todo: "Add credentials and business hours",
		isComplete: (p) =>
			!!p.draftOwnerInfo ||
			!!p.draftCredentials ||
			!!p.draftBusinessHours ||
			!!p.draftSocialLinks,
	},
	{
		id: "bio",
		todo: "Write a short bio",
		isComplete: (p) =>
			hasRichTextContent(p.draftBioContent) ||
			hasRichTextContent(p.draftContent),
	},
	{
		id: "imageGallery",
		todo: "Add 3 photos of recent work",
		isComplete: (p) => (p.galleryItemsDraft?.length ?? 0) > 0,
	},
	{
		id: "services",
		todo: "List the services you offer",
		isComplete: (p) => hasRichTextContent(p.draftServicesContent),
	},
	{
		id: "pricing",
		todo: "Add pricing tiers or a write-up",
		isComplete: (p) =>
			(p.draftPricingTiers?.length ?? 0) > 0 ||
			hasRichTextContent(p.draftPricingContent),
	},
];

const CREATE_PROOF_POINTS = [
	{
		icon: Globe,
		title: "A real web presence",
		description:
			"A polished public landing page for your business. No website builder required.",
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
			"Visitors submit quote requests that land in your request inbox and your tasks.",
	},
] as const;

function formatShortDate(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
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

/**
 * Miniature of the public page that live-mirrors the claim form. Mirrors the
 * Showcase layout's structure — banner, overlapping avatar, credential chips,
 * photo strip, dual CTA — so what the owner types is what they will get.
 */
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
		<div className="relative w-full max-w-lg" aria-hidden="true">
			<div className="overflow-hidden rounded-xl border border-border/80 bg-background shadow-lg shadow-black/[0.06]">
				{/* Browser chrome */}
				<div className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-3 py-2.5">
					<div className="flex gap-1.5" aria-hidden>
						<span className="size-2.5 rounded-full bg-border" />
						<span className="size-2.5 rounded-full bg-border" />
						<span className="size-2.5 rounded-full bg-border" />
					</div>
					<div className="ml-2 flex-1 truncate rounded-md border border-border/60 bg-background px-2.5 py-1.5 font-mono text-xs text-muted-foreground">
						onetool.biz/communities/
						<span className="text-foreground">{slug || "your-business"}</span>
					</div>
				</div>

				{/* Banner + floating CTA, as on the live page */}
				<div className="relative h-[92px]">
					<DotField className="text-primary opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
					<span
						className="absolute right-3 top-3 rounded-md bg-background px-2.5 py-1 text-[11px] font-semibold text-primary shadow-sm"
						aria-hidden
					>
						Request a quote
					</span>
				</div>

				<div className="px-5 pb-5">
					<div className="-mt-7 flex size-14 items-center justify-center rounded-xl border-4 border-background bg-primary/15 text-lg font-bold text-primary">
						{initial}
					</div>
					<p className="mt-3 truncate text-base font-bold tracking-tight text-foreground">
						{displayTitle}
					</p>
					<p className="mt-0.5 text-xs text-muted-foreground">
						Your services · Your town
					</p>
					{/* Credential strip */}
					<div className="mt-2.5 flex flex-wrap gap-1.5" aria-hidden>
						<span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-muted-foreground">
							Licensed &amp; insured
						</span>
						<span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-muted-foreground">
							Open today
						</span>
					</div>
					{/* Photo collage */}
					<div className="mt-3 grid grid-cols-3 gap-1.5" aria-hidden>
						<div className="aspect-4/3 rounded-md bg-muted" />
						<div className="aspect-4/3 rounded-md bg-muted" />
						<div className="aspect-4/3 rounded-md bg-muted" />
					</div>
					<div className="mt-3.5 flex gap-2" aria-hidden>
						<div className="h-7 flex-1 rounded-md bg-primary/80" />
						<div className="h-7 w-20 rounded-md bg-muted" />
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
			<Skeleton className="h-32 w-full rounded-xl" />
			<Skeleton className="h-64 w-full rounded-xl" />
		</div>
	);
}

function CommunityPageContent() {
	const router = useRouter();
	const toast = useToast();
	// Pending state for the editor navigation buttons — without it the first
	// click gives no feedback until the /community/edit route resolves.
	const [isOpeningEditor, startOpeningEditor] = useTransition();
	const openEditor = () => startOpeningEditor(() => router.push("/community/edit"));
	const { organization: clerkOrganization } = useOrganization();

	// Queries
	const communityPage = useQuery(api.communityPages.get);
	const organization = useQuery(api.organizations.get);
	const avatarUrl = useQuery(
		api.communityPages.getImageUrl,
		communityPage?.avatarStorageId
			? { storageId: communityPage.avatarStorageId }
			: "skip",
	);
	const bannerUrl = useQuery(
		api.communityPages.getImageUrl,
		communityPage?.bannerStorageId
			? { storageId: communityPage.bannerStorageId }
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
	const [shareOpen, setShareOpen] = useState(false);
	const [requestFilter, setRequestFilter] = useState<RequestFilter>("new");
	const [rangeDays, setRangeDays] = useState<RangeDays>(30);

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

	// Requests only exist once a page does. The filter is a query arg, so
	// toggling it re-subscribes; the counts are computed over the unfiltered
	// set either way, so they never disagree with each other.
	const inbox = useQuery(
		api.communityLeads.list,
		communityPage ? (requestFilter === "new" ? { status: "new" } : {}) : "skip",
	);
	// A minute-rounded clock keeps the query arg stable across re-evaluations so
	// the server cache can serve them; Date.now() on the server never repeats.
	// Re-read only when the org's calendar day rolls over, so a tab left open
	// past midnight doesn't keep charting yesterday.
	const orgToday = useOrgToday();
	const [analyticsNow, setAnalyticsNow] = useState(minuteFloor);
	const analyticsDay = useRef(orgToday);
	useEffect(() => {
		if (analyticsDay.current === orgToday) return;
		analyticsDay.current = orgToday;
		setAnalyticsNow(minuteFloor());
	}, [orgToday]);
	const stats = useQuery(
		api.communityAnalytics.dashboard,
		communityPage ? { days: rangeDays, now: analyticsNow } : "skip",
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
	const handleCopyUrl = useCallback(async () => {
		if (!communitySlug) return;
		const url = `${window.location.origin}/communities/${communitySlug}`;
		if (!(await copyToClipboard(url))) {
			toast.error("Couldn't copy the URL", "Copy it from the address bar");
			return;
		}
		setCopied(true);
		setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION_MS);
		toast.success("URL copied", "Share this link with your audience");
	}, [communitySlug, toast]);

	// Relative path keeps SSR/client markup identical; the absolute URL is only
	// built where window is guaranteed.
	const pagePath = communitySlug ? `/communities/${communitySlug}` : "";

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
					<FramePanel className="overflow-hidden p-0">
						<div className="grid items-stretch lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
							{/* Left: pitch + claim form */}
							<div className="space-y-7 px-7 py-8 sm:px-9">
								<div className="space-y-3">
									<Illustration
										name="community-page"
										size="md"
										className="-ml-4 w-40"
									/>
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
											<InputGroupAddon align="inline-end" role="status">
												{slugStatus === "checking" && (
													<>
														<Loader2
															className="size-4 animate-spin text-muted-foreground motion-reduce:animate-none"
															aria-hidden="true"
														/>
														<span className="sr-only">
															Checking availability
														</span>
													</>
												)}
												{slugStatus === "available" && (
													<span className="flex items-center gap-1.5 text-xs font-medium text-success-foreground">
														<span className="size-1.5 rounded-full bg-success" />
														Available
													</span>
												)}
												{slugStatus === "taken" && (
													<span className="flex items-center gap-1.5 text-xs font-medium text-danger-foreground">
														<span className="size-1.5 rounded-full bg-danger" />
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
										disabled={isCreating || slugStatus !== "available"}
									>
										{isCreating ? (
											<Loader2 className="size-4 mr-2 animate-spin motion-reduce:animate-none" />
										) : (
											<Sparkles className="size-4 mr-2" />
										)}
										{isCreating ? "Claiming…" : "Claim your page"}
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

									<LearnMoreLink
										article="community/your-public-page"
										label="Learn more about community pages"
									/>
								</div>
							</div>

							{/* Right: live-mirroring ghost preview */}
							<div className="relative hidden items-center justify-center border-l border-border/60 bg-muted/40 px-6 py-8 lg:flex">
								<DotField className="text-primary opacity-[0.45] [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_78%)]" />
								<GhostPreview
									slug={slug}
									pageTitle={pageTitle}
									orgName={organization?.name}
								/>
								<span className="absolute bottom-5 left-0 right-0 text-center text-xs text-muted-foreground">
									Updates as you type
								</span>
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
							<h3 className="text-sm font-semibold text-foreground">{title}</h3>
							<p className="mt-1 text-sm text-muted-foreground">{description}</p>
						</FramePanel>
					))}
				</Frame>
			</div>
		);
	}

	// ------------------------------------------------------------------
	// Page exists — results-first control room
	// ------------------------------------------------------------------
	const isLive = communityPage.isPublic;
	const displayTitle =
		communityPage.pageTitle || clerkOrganization?.name || "Your Community Page";
	const remainingSteps: SetupStep[] = SECTION_CHECKLIST.filter(
		(section) => !section.isComplete(communityPage),
	).map((section) => ({ id: section.id, label: section.todo }));
	const completedCount = SECTION_CHECKLIST.length - remainingSteps.length;
	const shareUrl =
		typeof window !== "undefined" && communitySlug
			? `${window.location.origin}${pagePath}`
			: "";
	const locationLine = [organization?.addressCity, organization?.addressState]
		.filter(Boolean)
		.join(", ");

	const headline = isLive
		? `onetool.biz${pagePath}${
				communityPage.publishedAt
					? ` · live since ${formatShortDate(communityPage.publishedAt)}`
					: " · live"
			}`
		: `onetool.biz${pagePath} · draft, not published yet`;

	return (
		<div className="space-y-6 p-6">
			<PageHeader subtitle={headline}>
				<div className="flex flex-wrap items-center gap-2.5">
					<Button
						variant="outline"
						size="sm"
						onClick={() => setShareOpen(true)}
						disabled={!isLive}
					>
						<QrCode className="size-4 mr-2" />
						QR &amp; share kit
					</Button>
					{isLive ? (
						<Button
							variant="outline"
							size="sm"
							nativeButton={false}
							render={
								<a href={pagePath} target="_blank" rel="noopener noreferrer" />
							}
						>
							<ExternalLink className="size-4 mr-2" />
							View live
						</Button>
					) : (
						<Button
							variant="outline"
							size="sm"
							onClick={openEditor}
							disabled={isOpeningEditor}
						>
							{isOpeningEditor ? (
								<Loader2 className="size-4 mr-2 animate-spin" />
							) : (
								<Send className="size-4 mr-2" />
							)}
							Review and publish
						</Button>
					)}
					<Button
						variant="default"
						size="sm"
						onClick={openEditor}
						disabled={isOpeningEditor}
					>
						{isOpeningEditor ? (
							<Loader2 className="size-4 mr-2 animate-spin" />
						) : (
							<Pencil className="size-4 mr-2" />
						)}
						Edit page
					</Button>
				</div>
			</PageHeader>

			<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
				<PerformancePanel
					stats={stats}
					days={rangeDays}
					onDaysChange={setRangeDays}
				/>
				<PageCard
					displayTitle={displayTitle}
					pagePath={pagePath}
					isLive={isLive}
					bannerUrl={bannerUrl}
					avatarUrl={avatarUrl}
					locationLine={locationLine || undefined}
					galleryCount={communityPage.galleryItemsDraft?.length ?? 0}
					layoutLabel={
						PAGE_LAYOUT_LABELS[resolvePageLayout(communityPage.draftTheme)]
					}
					remainingSteps={remainingSteps}
					completedCount={completedCount}
					totalSteps={SECTION_CHECKLIST.length}
					copied={copied}
					onCopy={handleCopyUrl}
					onShare={() => setShareOpen(true)}
				/>
			</div>

			{inbox === undefined ? (
				<Skeleton className="h-64 w-full rounded-xl" />
			) : (
				<RequestsTable
					leads={inbox.leads}
					newCount={inbox.newCount}
					total={inbox.total}
					filter={requestFilter}
					onFilterChange={setRequestFilter}
				/>
			)}

			<ShareKitDialog
				open={shareOpen}
				onOpenChange={setShareOpen}
				url={shareUrl}
				slug={communitySlug ?? ""}
				businessName={displayTitle}
			/>
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
