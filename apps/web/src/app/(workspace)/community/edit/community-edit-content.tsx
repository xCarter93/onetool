"use client";

import React, {
	useState,
	useRef,
	useEffect,
	useCallback,
	useMemo,
} from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import {
	Upload,
	Trash2,
	Globe,
	GlobeLock,
	Copy,
	Check,
	ExternalLink,
	Save,
	Send,
	Loader2,
	ImageIcon,
	ArrowLeft,
	ChevronUp,
	ChevronDown,
	Plus,
} from "lucide-react";
import type { JSONContent } from "@tiptap/react";

import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { StyledButton } from "@/components/ui/styled/styled-button";
import { StyledBadge } from "@/components/ui/styled/styled-badge";
import { StyledInput } from "@/components/ui/styled/styled-input";
import {
	StyledTabs,
	StyledTabsList,
	StyledTabsTrigger,
} from "@/components/ui/styled/styled-tabs";
import { CommunityEditor } from "@/components/tiptap/community-editor";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";

const MAX_BANNER_SIZE = 5 * 1024 * 1024;
const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
const MAX_GALLERY_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_GALLERY_IMAGES = 5;

type PricingMode = "structured" | "richText";
type SectionId =
	| "mainSettings"
	| "bio"
	| "imageGallery"
	| "services"
	| "pricing";

interface PricingTier {
	name: string;
	price: string;
	description: string;
}

interface GalleryItem {
	storageId: Id<"_storage">;
	sortOrder: number;
	url?: string | null;
}

interface Snapshot {
	mainSettings: string;
	bio: string;
	imageGallery: string;
	services: string;
	pricing: string;
}

const SECTION_LIST: Array<{ id: SectionId; label: string }> = [
	{ id: "mainSettings", label: "Main Page Settings" },
	{ id: "bio", label: "Bio" },
	{ id: "imageGallery", label: "Image Gallery" },
	{ id: "services", label: "Services" },
	{ id: "pricing", label: "Pricing" },
];

export default function CommunityEditContent() {
	const router = useRouter();
	const toast = useToast();

	const communityPage = useQuery(api.communityPages.get);
	const organization = useQuery(api.organizations.get);

	const upsert = useMutation(api.communityPages.upsert);
	const publish = useMutation(api.communityPages.publish);
	const generateUploadUrl = useMutation(api.communityPages.generateUploadUrl);
	const deleteBanner = useMutation(api.communityPages.deleteBannerImage);
	const deleteAvatar = useMutation(api.communityPages.deleteAvatarImage);

	const [pageTitle, setPageTitle] = useState("");
	const [slug, setSlug] = useState("");
	const [metaDescription, setMetaDescription] = useState("");
	const [isPublic, setIsPublic] = useState(false);
	const [bioContent, setBioContent] = useState<JSONContent | undefined>();
	const [servicesContent, setServicesContent] = useState<
		JSONContent | undefined
	>();
	const [pricingMode, setPricingMode] = useState<PricingMode>("richText");
	const [pricingContent, setPricingContent] = useState<
		JSONContent | undefined
	>();
	const [pricingTiers, setPricingTiers] = useState<PricingTier[]>([]);

	const [bannerUrl, setBannerUrl] = useState<string | null>(null);
	const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
	const [bannerStorageId, setBannerStorageId] = useState<Id<"_storage"> | null>(
		null,
	);
	const [avatarStorageId, setAvatarStorageId] = useState<Id<"_storage"> | null>(
		null,
	);
	const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);

	const [isSaving, setIsSaving] = useState(false);
	const [isPublishing, setIsPublishing] = useState(false);
	const [isUploadingBanner, setIsUploadingBanner] = useState(false);
	const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
	const [isUploadingGallery, setIsUploadingGallery] = useState(false);
	const [slugError, setSlugError] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const [debouncedSlug, setDebouncedSlug] = useState("");
	const [activeSection, setActiveSection] = useState<SectionId>("mainSettings");

	const bannerInputRef = useRef<HTMLInputElement>(null);
	const avatarInputRef = useRef<HTMLInputElement>(null);
	const galleryInputRef = useRef<HTMLInputElement>(null);
	const sectionRefs = useRef<Record<SectionId, HTMLElement | null>>({
		mainSettings: null,
		bio: null,
		imageGallery: null,
		services: null,
		pricing: null,
	});
	const savedSnapshotRef = useRef<Snapshot | null>(null);

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

	useEffect(() => {
		if (communityPage === null) {
			router.replace("/community");
		}
	}, [communityPage, router]);

	useEffect(() => {
		if (!communityPage) return;

		const draftBio =
			(communityPage.draftBioContent as JSONContent | undefined) ??
			(communityPage.draftContent as JSONContent | undefined);

		setPageTitle(communityPage.pageTitle || "");
		setSlug(communityPage.slug);
		setMetaDescription(communityPage.metaDescription || "");
		setIsPublic(communityPage.isPublic);
		setBioContent(draftBio);
		setServicesContent(
			communityPage.draftServicesContent as JSONContent | undefined,
		);
		setPricingMode(
			(communityPage.pricingModeDraft as PricingMode | undefined) ?? "richText",
		);
		setPricingContent(
			communityPage.draftPricingContent as JSONContent | undefined,
		);
		setPricingTiers(
			(communityPage.draftPricingTiers ?? []).map((tier) => ({
				name: tier.name,
				price: tier.price,
				description: tier.description ?? "",
			})),
		);
		setBannerStorageId(communityPage.bannerStorageId || null);
		setAvatarStorageId(communityPage.avatarStorageId || null);
		setGalleryItems(
			(communityPage.galleryItemsDraft ?? [])
				.slice()
				.sort((a, b) => a.sortOrder - b.sortOrder)
				.map((item) => ({
					storageId: item.storageId,
					sortOrder: item.sortOrder,
					url: null,
				})),
		);

		savedSnapshotRef.current = createSnapshot({
			pageTitle: communityPage.pageTitle || "",
			slug: communityPage.slug,
			metaDescription: communityPage.metaDescription || "",
			isPublic: communityPage.isPublic,
			bannerStorageId: communityPage.bannerStorageId || null,
			avatarStorageId: communityPage.avatarStorageId || null,
			bioContent: draftBio,
			servicesContent: communityPage.draftServicesContent as
				| JSONContent
				| undefined,
			pricingMode:
				(communityPage.pricingModeDraft as PricingMode | undefined) ??
				"richText",
			pricingContent: communityPage.draftPricingContent as
				| JSONContent
				| undefined,
			pricingTiers: (communityPage.draftPricingTiers ?? []).map((tier) => ({
				name: tier.name,
				price: tier.price,
				description: tier.description ?? "",
			})),
			galleryItems: (communityPage.galleryItemsDraft ?? [])
				.slice()
				.sort((a, b) => a.sortOrder - b.sortOrder)
				.map((item) => ({
					storageId: item.storageId,
					sortOrder: item.sortOrder,
				})),
		});
	}, [communityPage]);

	const bannerUrlQuery = useQuery(
		api.communityPages.getImageUrl,
		bannerStorageId ? { storageId: bannerStorageId } : "skip",
	);
	const avatarUrlQuery = useQuery(
		api.communityPages.getImageUrl,
		avatarStorageId ? { storageId: avatarStorageId } : "skip",
	);
	const galleryUrlsQuery = useQuery(
		api.communityPages.getImageUrls,
		galleryItems.length > 0
			? { storageIds: galleryItems.map((item) => item.storageId) }
			: "skip",
	);

	useEffect(() => {
		if (bannerUrlQuery) setBannerUrl(bannerUrlQuery);
	}, [bannerUrlQuery]);

	useEffect(() => {
		if (avatarUrlQuery) setAvatarUrl(avatarUrlQuery);
		else if (!avatarStorageId && organization?.logoUrl) {
			setAvatarUrl(organization.logoUrl);
		}
	}, [avatarUrlQuery, avatarStorageId, organization?.logoUrl]);

	useEffect(() => {
		if (!galleryUrlsQuery) return;
		const urlMap = new Map(
			galleryUrlsQuery.map((item) => [String(item.storageId), item.url]),
		);
		setGalleryItems((prev) => {
			let changed = false;
			const next = prev.map((item) => {
				const url = urlMap.get(String(item.storageId));
				if (url !== undefined && item.url !== url) {
					changed = true;
					return { ...item, url };
				}
				return item;
			});
			return changed ? next : prev;
		});
	}, [galleryUrlsQuery]);

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

	const uploadImage = async (
		file: File,
		type: "banner" | "avatar" | "gallery",
	) => {
		const maxSize =
			type === "banner"
				? MAX_BANNER_SIZE
				: type === "avatar"
					? MAX_AVATAR_SIZE
					: MAX_GALLERY_IMAGE_SIZE;
		if (file.size > maxSize) {
			toast.error(
				"File too large",
				`Maximum size is ${maxSize / 1024 / 1024}MB`,
			);
			return;
		}
		if (!file.type.startsWith("image/")) {
			toast.error("Invalid file type", "Please upload an image file");
			return;
		}
		if (type === "gallery" && galleryItems.length >= MAX_GALLERY_IMAGES) {
			toast.error(
				"Gallery full",
				`You can upload up to ${MAX_GALLERY_IMAGES} images`,
			);
			return;
		}

		if (type === "banner") setIsUploadingBanner(true);
		if (type === "avatar") setIsUploadingAvatar(true);
		if (type === "gallery") setIsUploadingGallery(true);

		try {
			const uploadUrl = await generateUploadUrl();
			const response = await fetch(uploadUrl, {
				method: "POST",
				headers: { "Content-Type": file.type },
				body: file,
			});
			if (!response.ok) throw new Error("Upload failed");
			const { storageId } = await response.json();

			if (type === "banner") {
				setBannerStorageId(storageId);
			} else if (type === "avatar") {
				setAvatarStorageId(storageId);
			} else {
				setGalleryItems((prev) => [
					...prev,
					{
						storageId,
						sortOrder: prev.length,
						url: null,
					},
				]);
			}

			toast.success("Image uploaded", "Don't forget to save your changes");
		} catch {
			toast.error("Upload failed", "Please try again");
		} finally {
			if (type === "banner") setIsUploadingBanner(false);
			if (type === "avatar") setIsUploadingAvatar(false);
			if (type === "gallery") setIsUploadingGallery(false);
		}
	};

	const currentSnapshot = useMemo(
		() =>
			createSnapshot({
				pageTitle,
				slug,
				metaDescription,
				isPublic,
				bannerStorageId,
				avatarStorageId,
				bioContent,
				servicesContent,
				pricingMode,
				pricingContent,
				pricingTiers,
				galleryItems,
			}),
		[
			pageTitle,
			slug,
			metaDescription,
			isPublic,
			bannerStorageId,
			avatarStorageId,
			bioContent,
			servicesContent,
			pricingMode,
			pricingContent,
			pricingTiers,
			galleryItems,
		],
	);

	const dirtyBySection = useMemo(() => {
		const saved = savedSnapshotRef.current;
		if (!saved) {
			return {
				mainSettings: false,
				bio: false,
				imageGallery: false,
				services: false,
				pricing: false,
			};
		}
		return {
			mainSettings: saved.mainSettings !== currentSnapshot.mainSettings,
			bio: saved.bio !== currentSnapshot.bio,
			imageGallery: saved.imageGallery !== currentSnapshot.imageGallery,
			services: saved.services !== currentSnapshot.services,
			pricing: saved.pricing !== currentSnapshot.pricing,
		};
	}, [currentSnapshot]);

	const hasUnsavedChanges = useMemo(
		() => Object.values(dirtyBySection).some(Boolean),
		[dirtyBySection],
	);

	const hasPublishableContent =
		!!bioContent ||
		!!servicesContent ||
		!!pricingContent ||
		pricingTiers.length > 0 ||
		galleryItems.length > 0;

	const handleSave = async () => {
		if (!validateSlug(slug)) return;

		setIsSaving(true);
		try {
			await upsert({
				slug,
				isPublic,
				pageTitle: pageTitle || undefined,
				metaDescription: metaDescription || undefined,
				draftContent: bioContent,
				draftBioContent: bioContent,
				draftServicesContent: servicesContent,
				pricingModeDraft: pricingMode,
				draftPricingContent: pricingContent,
				draftPricingTiers: pricingTiers.map((tier) => ({
					name: tier.name,
					price: tier.price,
					description: tier.description || undefined,
				})),
				galleryItemsDraft: galleryItems.map((item, index) => ({
					storageId: item.storageId,
					sortOrder: index,
				})),
				bannerStorageId: bannerStorageId || undefined,
				avatarStorageId: avatarStorageId || undefined,
			});

			if (isPublic) {
				await publish();
			}

			savedSnapshotRef.current = currentSnapshot;
			toast.success(
				isPublic ? "Changes published" : "Draft saved",
				isPublic
					? "Your live page has been updated"
					: "Your changes have been saved",
			);
		} catch (error) {
			toast.error(
				"Save failed",
				error instanceof Error ? error.message : "Please try again",
			);
		} finally {
			setIsSaving(false);
		}
	};

	const handlePublish = async () => {
		if (!validateSlug(slug)) return;

		setIsPublishing(true);
		try {
			await upsert({
				slug,
				isPublic: true,
				pageTitle: pageTitle || undefined,
				metaDescription: metaDescription || undefined,
				draftContent: bioContent,
				draftBioContent: bioContent,
				draftServicesContent: servicesContent,
				pricingModeDraft: pricingMode,
				draftPricingContent: pricingContent,
				draftPricingTiers: pricingTiers.map((tier) => ({
					name: tier.name,
					price: tier.price,
					description: tier.description || undefined,
				})),
				galleryItemsDraft: galleryItems.map((item, index) => ({
					storageId: item.storageId,
					sortOrder: index,
				})),
				bannerStorageId: bannerStorageId || undefined,
				avatarStorageId: avatarStorageId || undefined,
			});

			await publish();
			setIsPublic(true);
			savedSnapshotRef.current = createSnapshot({
				pageTitle,
				slug,
				metaDescription,
				isPublic: true,
				bannerStorageId,
				avatarStorageId,
				bioContent,
				servicesContent,
				pricingMode,
				pricingContent,
				pricingTiers,
				galleryItems,
			});
			toast.success("Published!", "Your community page is now live and public");
		} catch (error) {
			toast.error(
				"Publish failed",
				error instanceof Error ? error.message : "Please try again",
			);
		} finally {
			setIsPublishing(false);
		}
	};

	const handleMakePrivate = async () => {
		try {
			await upsert({ isPublic: false });
			setIsPublic(false);
			savedSnapshotRef.current = createSnapshot({
				pageTitle,
				slug,
				metaDescription,
				isPublic: false,
				bannerStorageId,
				avatarStorageId,
				bioContent,
				servicesContent,
				pricingMode,
				pricingContent,
				pricingTiers,
				galleryItems,
			});
			toast.success("Page is now private", "Only you can see your page");
		} catch {
			toast.error("Failed to update visibility");
		}
	};

	const handleCopyUrl = () => {
		const url = `${window.location.origin}/communities/${slug}`;
		navigator.clipboard.writeText(url);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
		toast.success("URL copied", "Share this link with your audience");
	};

	const handleDeleteBanner = async () => {
		try {
			await deleteBanner();
			setBannerStorageId(null);
			setBannerUrl(null);
			toast.success("Banner removed");
		} catch {
			toast.error("Failed to remove banner");
		}
	};

	const handleDeleteAvatar = async () => {
		try {
			await deleteAvatar();
			setAvatarStorageId(null);
			setAvatarUrl(organization?.logoUrl || null);
			toast.success("Avatar removed", "Using organization logo");
		} catch {
			toast.error("Failed to remove avatar");
		}
	};

	const removeGalleryItem = (storageId: Id<"_storage">) => {
		setGalleryItems((prev) =>
			prev
				.filter((item) => item.storageId !== storageId)
				.map((item, index) => ({ ...item, sortOrder: index })),
		);
	};

	const moveGalleryItem = (index: number, direction: -1 | 1) => {
		setGalleryItems((prev) => {
			const target = index + direction;
			if (target < 0 || target >= prev.length) return prev;
			const next = [...prev];
			const currentItem = next[index];
			next[index] = next[target];
			next[target] = currentItem;
			return next.map((item, i) => ({ ...item, sortOrder: i }));
		});
	};

	const isPageLoaded = communityPage !== undefined && communityPage !== null;

	useEffect(() => {
		if (!isPageLoaded) return;

		const visibleSections = new Set<SectionId>();

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						visibleSections.add(entry.target.id as SectionId);
					} else {
						visibleSections.delete(entry.target.id as SectionId);
					}
				}
				for (const section of SECTION_LIST) {
					if (visibleSections.has(section.id)) {
						setActiveSection(section.id);
						break;
					}
				}
			},
			{
				root: null,
				rootMargin: "-180px 0px -35% 0px",
				threshold: [0, 0.15],
			},
		);

		for (const section of SECTION_LIST) {
			const element = sectionRefs.current[section.id];
			if (element) observer.observe(element);
		}

		return () => observer.disconnect();
	}, [isPageLoaded]);

	const publicUrl = `${
		typeof window !== "undefined" ? window.location.origin : ""
	}/communities/${slug}`;

	if (communityPage === undefined || communityPage === null) {
		return (
			<div className="flex items-center justify-center min-h-[400px]">
				<Loader2 className="size-8 animate-spin text-muted-fg" />
			</div>
		);
	}

	return (
		<div className="relative min-h-screen bg-bg">
			<div className="sticky top-16 md:top-[72px] z-20 bg-bg/90 backdrop-blur-md border-b border-border/60">
				<div className="mx-auto px-4 sm:px-6 lg:px-8 py-4">
					<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
						<div className="flex items-center gap-4">
							<Button
								intent="outline"
								size="sq-sm"
								onPress={() => router.push("/community")}
								aria-label="Back to Community"
							>
								<ArrowLeft className="size-4" />
							</Button>
							<div>
								<div className="flex items-center gap-3">
									<h1 className="text-xl font-bold text-fg">Edit Page</h1>
									{isPublic ? (
										<StyledBadge variant="success">
											<Globe className="size-3" />
											Live
										</StyledBadge>
									) : (
										<StyledBadge variant="warning">
											<GlobeLock className="size-3" />
											Private
										</StyledBadge>
									)}
								</div>
								{isPublic && (
									<div className="flex items-center gap-2 mt-1">
										<a
											href={publicUrl}
											target="_blank"
											rel="noopener noreferrer"
											className="text-xs text-muted-fg hover:text-fg font-mono flex items-center gap-1 transition-colors"
										>
											{publicUrl}
											<ExternalLink className="size-3" />
										</a>
										<button
											onClick={handleCopyUrl}
											className="text-xs text-muted-fg hover:text-fg transition-colors"
										>
											{copied ? (
												<Check className="size-3 text-emerald-500" />
											) : (
												<Copy className="size-3" />
											)}
										</button>
									</div>
								)}
							</div>
						</div>

						<div className="flex items-center gap-3">
							{hasUnsavedChanges && (
								<span className="text-sm font-medium text-amber-600 dark:text-amber-500 animate-pulse hidden sm:inline-block pr-2">
									Unsaved changes
								</span>
							)}
							<StyledButton
								intent={hasUnsavedChanges ? "primary" : "secondary"}
								onClick={handleSave}
								disabled={
									isSaving ||
									isPublishing ||
									!!slugError ||
									isSlugAvailable === false ||
									(!hasUnsavedChanges && !isPublic)
								}
							>
								{isSaving ? (
									<Loader2 className="size-4 mr-2 animate-spin" />
								) : (
									<Save className="size-4 mr-2" />
								)}
								{isPublic ? "Save Changes" : "Save Draft"}
							</StyledButton>
							{!isPublic && (
								<StyledButton
									intent="primary"
									onClick={handlePublish}
									disabled={
										isSaving ||
										isPublishing ||
										!hasPublishableContent ||
										!!slugError ||
										isSlugAvailable === false
									}
								>
									{isPublishing ? (
										<Loader2 className="size-4 mr-2 animate-spin" />
									) : (
										<Send className="size-4 mr-2" />
									)}
									Publish
								</StyledButton>
							)}
						</div>
					</div>
				</div>
			</div>

			<div className="mx-auto px-4 sm:px-6 lg:px-8 py-8">
				<div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
					<div className="space-y-12 pb-[40vh]">
						<section
							id="mainSettings"
							ref={(el) => {
								sectionRefs.current.mainSettings = el;
							}}
							className="scroll-mt-44 space-y-10"
						>
							<div>
								<h2 className="text-lg font-semibold text-fg">
									Main Page Settings
								</h2>
								<p className="text-sm text-muted-fg">
									Configure branding, URL, and SEO information.
								</p>
							</div>

							<div className="space-y-4">
								<h3 className="text-base font-semibold text-fg">
									Banner Image
								</h3>
								<div
									className={cn(
										"relative w-full aspect-[4.8/1] rounded-2xl overflow-hidden border border-border/60 bg-muted/20",
										"hover:border-primary/50 transition-colors cursor-pointer group",
										isUploadingBanner && "opacity-50 pointer-events-none",
									)}
									onClick={() => bannerInputRef.current?.click()}
								>
									{bannerUrl ? (
										<>
											<Image
												src={bannerUrl}
												alt="Banner"
												fill
												className="object-cover"
											/>
											<div
												className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4"
												onClick={(e) => e.stopPropagation()}
											>
												<Button
													intent="secondary"
													size="sm"
													onPress={() => bannerInputRef.current?.click()}
												>
													<Upload className="size-4 mr-2" />
													Replace
												</Button>
												<Button
													intent="destructive"
													size="sm"
													onPress={handleDeleteBanner}
												>
													<Trash2 className="size-4 mr-2" />
													Remove
												</Button>
											</div>
										</>
									) : (
										<div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-fg group-hover:text-fg transition-colors">
											{isUploadingBanner ? (
												<Loader2 className="size-8 animate-spin" />
											) : (
												<>
													<ImageIcon className="size-10 mb-2 opacity-50 group-hover:opacity-100 transition-opacity" />
													<span className="text-sm font-medium">
														Click to upload banner image
													</span>
													<span className="text-xs opacity-70">Max 5MB</span>
												</>
											)}
										</div>
									)}
								</div>
								<input
									ref={bannerInputRef}
									type="file"
									accept="image/*"
									className="hidden"
									onChange={(e) => {
										const file = e.target.files?.[0];
										if (file) void uploadImage(file, "banner");
										e.target.value = "";
									}}
								/>
							</div>

							<div className="space-y-4">
								<h3 className="text-base font-semibold text-fg">
									Avatar / Logo
								</h3>
								<div className="flex items-center gap-6">
									<div
										className={cn(
											"relative size-24 rounded-2xl overflow-hidden border border-border/60 bg-muted/20",
											"hover:border-primary/50 transition-colors cursor-pointer group",
											isUploadingAvatar && "opacity-50 pointer-events-none",
										)}
										onClick={() => avatarInputRef.current?.click()}
									>
										{avatarUrl ? (
											<>
												<Image
													src={avatarUrl}
													alt="Avatar"
													fill
													className="object-cover"
												/>
												<div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
													<Upload className="size-5 text-white" />
												</div>
											</>
										) : (
											<div className="absolute inset-0 flex items-center justify-center text-muted-fg">
												{isUploadingAvatar ? (
													<Loader2 className="size-6 animate-spin" />
												) : (
													<ImageIcon className="size-8 opacity-50" />
												)}
											</div>
										)}
									</div>
									<div className="flex flex-col gap-2">
										<Button
											intent="outline"
											size="sm"
											onPress={() => avatarInputRef.current?.click()}
											isDisabled={isUploadingAvatar}
										>
											<Upload className="size-4 mr-2" />
											Upload Avatar
										</Button>
										{avatarStorageId && (
											<Button
												intent="plain"
												size="sm"
												onPress={handleDeleteAvatar}
											>
												<Trash2 className="size-4 mr-2" />
												Use Organization Logo
											</Button>
										)}
									</div>
								</div>
								<input
									ref={avatarInputRef}
									type="file"
									accept="image/*"
									className="hidden"
									onChange={(e) => {
										const file = e.target.files?.[0];
										if (file) void uploadImage(file, "avatar");
										e.target.value = "";
									}}
								/>
							</div>

							<div className="grid gap-8 lg:grid-cols-2">
								<div className="space-y-3">
									<Label htmlFor="pageTitle">Page Title</Label>
									<StyledInput
										id="pageTitle"
										value={pageTitle}
										onChange={(e) => setPageTitle(e.target.value)}
										placeholder={organization?.name || "Your Business Name"}
									/>
								</div>

								<div className="space-y-3">
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
										  (debouncedSlug !== slug ||
												isSlugAvailable === undefined) ? (
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
								</div>

								<div className="space-y-3 lg:col-span-2">
									<Label htmlFor="metaDescription">SEO Description</Label>
									<StyledInput
										id="metaDescription"
										value={metaDescription}
										onChange={(e) => setMetaDescription(e.target.value)}
										placeholder="A brief description for search engines (optional)"
									/>
									<p className="text-xs text-muted-fg">
										{metaDescription.length}/160 characters recommended
									</p>
								</div>
							</div>

							{isPublic && (
								<div className="pt-2">
									<StyledButton
										intent="secondary"
										size="sm"
										onClick={handleMakePrivate}
									>
										Make Page Private
									</StyledButton>
								</div>
							)}
						</section>

						<section
							id="bio"
							ref={(el) => {
								sectionRefs.current.bio = el;
							}}
							className="scroll-mt-44"
						>
							<div className="mb-4">
								<h2 className="text-lg font-semibold text-fg">Bio</h2>
								<p className="text-sm text-muted-fg">
									Tell visitors who you are and what makes your business unique.
								</p>
							</div>
							<CommunityEditor
								content={bioContent}
								onChange={setBioContent}
								placeholder="Share your story, background, and core values..."
							/>
						</section>

						<section
							id="imageGallery"
							ref={(el) => {
								sectionRefs.current.imageGallery = el;
							}}
							className="scroll-mt-44"
						>
							<div className="mb-4 flex items-start justify-between gap-4">
								<div className="flex items-center gap-3">
									<h2 className="text-lg font-semibold text-fg">
										Image Gallery
									</h2>
									<StyledBadge variant={galleryItems.length >= MAX_GALLERY_IMAGES ? "warning" : "default"}>
										{galleryItems.length}/{MAX_GALLERY_IMAGES}
									</StyledBadge>
								</div>
								{galleryItems.length > 0 && galleryItems.length < MAX_GALLERY_IMAGES && (
									<StyledButton
										intent="secondary"
										size="sm"
										onClick={() => galleryInputRef.current?.click()}
										disabled={isUploadingGallery}
									>
										{isUploadingGallery ? (
											<Loader2 className="size-4 mr-2 animate-spin" />
										) : (
											<Plus className="size-4 mr-2" />
										)}
										Add Image
									</StyledButton>
								)}
							</div>
							<input
								ref={galleryInputRef}
								type="file"
								accept="image/*"
								className="hidden"
								onChange={(e) => {
									const file = e.target.files?.[0];
									if (file) void uploadImage(file, "gallery");
									e.target.value = "";
								}}
							/>

							{galleryItems.length === 0 ? (
								<div
									className="rounded-xl border-2 border-dashed border-border/70 bg-muted/10 p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all group"
									onClick={() => galleryInputRef.current?.click()}
								>
									{isUploadingGallery ? (
										<Loader2 className="size-10 mx-auto animate-spin text-muted-fg mb-3" />
									) : (
										<ImageIcon className="size-10 mx-auto text-muted-fg/50 group-hover:text-primary/60 transition-colors mb-3" />
									)}
									<p className="text-sm font-medium text-fg">Add photos of your work</p>
									<p className="text-xs text-muted-fg mt-1">Up to {MAX_GALLERY_IMAGES} images, 5MB each</p>
								</div>
							) : (
								<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
									{galleryItems.map((item, index) => (
										<div
											key={item.storageId}
											className="group relative rounded-xl overflow-hidden border border-border/60 bg-bg"
										>
											<div className="relative aspect-4/3 bg-muted/30">
												{item.url ? (
													<Image
														src={item.url}
														alt={`Gallery image ${index + 1}`}
														fill
														className="object-cover"
													/>
												) : (
													<div className="absolute inset-0 flex items-center justify-center text-muted-fg">
														<Loader2 className="size-5 animate-spin" />
													</div>
												)}
												<div className="absolute inset-0 bg-linear-to-t from-black/60 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
												<div className="absolute bottom-0 inset-x-0 p-3 flex items-end justify-between opacity-0 group-hover:opacity-100 transition-opacity">
													<span className="text-xs font-medium text-white/90 bg-black/30 backdrop-blur-sm rounded-md px-2 py-1">
														{index + 1} of {galleryItems.length}
													</span>
													<div className="flex items-center gap-1.5">
														<button
															type="button"
															onClick={() => moveGalleryItem(index, -1)}
															disabled={index === 0}
															className="size-8 rounded-lg bg-white/20 backdrop-blur-sm text-white flex items-center justify-center hover:bg-white/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
														>
															<ChevronUp className="size-4" />
														</button>
														<button
															type="button"
															onClick={() => moveGalleryItem(index, 1)}
															disabled={index === galleryItems.length - 1}
															className="size-8 rounded-lg bg-white/20 backdrop-blur-sm text-white flex items-center justify-center hover:bg-white/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
														>
															<ChevronDown className="size-4" />
														</button>
														<button
															type="button"
															onClick={() => removeGalleryItem(item.storageId)}
															className="size-8 rounded-lg bg-red-500/80 backdrop-blur-sm text-white flex items-center justify-center hover:bg-red-500 transition-colors"
														>
															<Trash2 className="size-4" />
														</button>
													</div>
												</div>
											</div>
										</div>
									))}
									{galleryItems.length < MAX_GALLERY_IMAGES && (
										<div
											className="rounded-xl border-2 border-dashed border-border/50 bg-muted/10 flex items-center justify-center cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-all aspect-4/3"
											onClick={() => galleryInputRef.current?.click()}
										>
											<div className="text-center">
												{isUploadingGallery ? (
													<Loader2 className="size-6 mx-auto animate-spin text-muted-fg mb-2" />
												) : (
													<Plus className="size-6 mx-auto text-muted-fg/50 mb-2" />
												)}
												<span className="text-xs text-muted-fg">Add more</span>
											</div>
										</div>
									)}
								</div>
							)}
						</section>

						<section
							id="services"
							ref={(el) => {
								sectionRefs.current.services = el;
							}}
							className="scroll-mt-44"
						>
							<div className="mb-4">
								<h2 className="text-lg font-semibold text-fg">Services</h2>
								<p className="text-sm text-muted-fg">
									Describe your services and what clients can expect.
								</p>
							</div>
							<CommunityEditor
								content={servicesContent}
								onChange={setServicesContent}
								placeholder="List services, specialties, and service areas..."
							/>
						</section>

						<section
							id="pricing"
							ref={(el) => {
								sectionRefs.current.pricing = el;
							}}
							className="scroll-mt-44 pb-12"
						>
							<div className="mb-4">
								<h2 className="text-lg font-semibold text-fg">Pricing</h2>
								<p className="text-sm text-muted-fg">
									Choose structured tiers or a rich-text pricing section.
								</p>
							</div>
							<StyledTabs
								value={pricingMode}
								onValueChange={(v) =>
									setPricingMode(v as PricingMode)
								}
								className="mb-5 w-auto"
							>
								<StyledTabsList>
									<StyledTabsTrigger value="structured">
										Structured tiers
									</StyledTabsTrigger>
									<StyledTabsTrigger value="richText">
										Rich text
									</StyledTabsTrigger>
								</StyledTabsList>
							</StyledTabs>

							{pricingMode === "structured" ? (
								<div className="space-y-4">
									{pricingTiers.map((tier, index) => (
										<div
											key={index}
											className="rounded-xl border border-border/60 overflow-hidden bg-bg"
										>
											<div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b border-border/40">
												<div className="flex items-center gap-3">
													<span className="size-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
														{index + 1}
													</span>
													<span className="text-sm font-medium text-fg truncate max-w-[200px]">
														{tier.name || "Untitled Tier"}
													</span>
												</div>
												<StyledButton
													intent="destructive"
													size="sm"
													onClick={() =>
														setPricingTiers((prev) =>
															prev.filter((_, i) => i !== index),
														)
													}
												>
													<Trash2 className="size-3.5 mr-1.5" />
													Remove
												</StyledButton>
											</div>
											<div className="p-4 space-y-3">
												<div className="grid gap-3 sm:grid-cols-2">
													<div className="space-y-2">
														<Label className="text-xs uppercase tracking-wider text-muted-fg">Tier Name</Label>
														<StyledInput
															value={tier.name}
															onChange={(e) =>
																setPricingTiers((prev) =>
																	prev.map((item, i) =>
																		i === index
																			? { ...item, name: e.target.value }
																			: item,
																	),
																)
															}
															placeholder="e.g. Starter Package"
														/>
													</div>
													<div className="space-y-2">
														<Label className="text-xs uppercase tracking-wider text-muted-fg">Price</Label>
														<StyledInput
															value={tier.price}
															onChange={(e) =>
																setPricingTiers((prev) =>
																	prev.map((item, i) =>
																		i === index
																			? { ...item, price: e.target.value }
																			: item,
																	),
																)
															}
															placeholder="$199 / month"
														/>
													</div>
												</div>
												<div className="space-y-2">
													<Label className="text-xs uppercase tracking-wider text-muted-fg">Description</Label>
													<StyledInput
														value={tier.description}
														onChange={(e) =>
															setPricingTiers((prev) =>
																prev.map((item, i) =>
																	i === index
																		? { ...item, description: e.target.value }
																		: item,
																),
															)
														}
														placeholder="Brief description of what's included"
													/>
												</div>
											</div>
										</div>
									))}
									<StyledButton
										intent="secondary"
										onClick={() =>
											setPricingTiers((prev) => [
												...prev,
												{ name: "", price: "", description: "" },
											])
										}
									>
										<Plus className="size-4 mr-2" />
										Add Tier
									</StyledButton>
								</div>
							) : (
								<CommunityEditor
									content={pricingContent}
									onChange={setPricingContent}
									placeholder="Describe your pricing options, packages, and custom quotes..."
								/>
							)}
						</section>
					</div>

					<aside className="hidden lg:block">
						<div className="sticky top-40 rounded-xl border border-border/60 bg-bg p-3">
							<nav className="space-y-1">
								{SECTION_LIST.map((section) => (
									<button
										key={section.id}
										type="button"
										onClick={() =>
											sectionRefs.current[section.id]?.scrollIntoView({
												behavior: "smooth",
												block: "start",
											})
										}
										className={cn(
											"w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-200 flex items-center justify-between",
											activeSection === section.id
												? "bg-primary/10 text-primary font-medium ring-1 ring-primary/20 shadow-sm"
												: "text-muted-fg hover:bg-muted/40 hover:text-fg",
										)}
									>
										<span>{section.label}</span>
										{dirtyBySection[section.id] && (
											<span className="size-2 rounded-full bg-amber-500" />
										)}
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

function createSnapshot({
	pageTitle,
	slug,
	metaDescription,
	isPublic,
	bannerStorageId,
	avatarStorageId,
	bioContent,
	servicesContent,
	pricingMode,
	pricingContent,
	pricingTiers,
	galleryItems,
}: {
	pageTitle: string;
	slug: string;
	metaDescription: string;
	isPublic: boolean;
	bannerStorageId: Id<"_storage"> | null;
	avatarStorageId: Id<"_storage"> | null;
	bioContent: JSONContent | undefined;
	servicesContent: JSONContent | undefined;
	pricingMode: PricingMode;
	pricingContent: JSONContent | undefined;
	pricingTiers: PricingTier[];
	galleryItems: Array<{ storageId: Id<"_storage">; sortOrder: number }>;
}): Snapshot {
	return {
		mainSettings: JSON.stringify({
			pageTitle,
			slug,
			metaDescription,
			isPublic,
			bannerStorageId,
			avatarStorageId,
		}),
		bio: JSON.stringify(bioContent ?? null),
		imageGallery: JSON.stringify(
			galleryItems.map((item, index) => ({
				storageId: item.storageId,
				sortOrder: item.sortOrder ?? index,
			})),
		),
		services: JSON.stringify(servicesContent ?? null),
		pricing: JSON.stringify({
			pricingMode,
			pricingContent: pricingContent ?? null,
			pricingTiers,
		}),
	};
}
