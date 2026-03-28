"use client";

import {
	useState,
	useRef,
	useEffect,
	useCallback,
	useMemo,
} from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import type { JSONContent } from "@tiptap/react";

import { useToast } from "@/hooks/use-toast";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { isValidUrl as isValidSocialUrl } from "@/lib/validators";

const MAX_BANNER_SIZE = 5 * 1024 * 1024;
const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
const MAX_GALLERY_IMAGE_SIZE = 5 * 1024 * 1024;
export const MAX_GALLERY_IMAGES = 5;

export type PricingMode = "structured" | "richText";
export type SectionId =
	| "mainSettings"
	| "design"
	| "businessInfo"
	| "bio"
	| "imageGallery"
	| "services"
	| "pricing";

export interface PricingTier {
	name: string;
	price: string;
	description: string;
}

export interface GalleryItem {
	storageId: Id<"_storage">;
	sortOrder: number;
	url?: string | null;
}

export interface DaySchedule {
	day: string;
	open: string;
	close: string;
	isClosed: boolean;
}

export type SocialLinks = {
	facebook?: string;
	instagram?: string;
	nextdoor?: string;
	youtube?: string;
	linkedin?: string;
	yelp?: string;
	google?: string;
};

const DAYS_OF_WEEK = [
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
	"Sunday",
] as const;

const DEFAULT_SCHEDULE: DaySchedule[] = DAYS_OF_WEEK.map((day) => ({
	day,
	open: "09:00",
	close: "17:00",
	isClosed: false,
}));

const EMPTY_SOCIAL_LINKS: SocialLinks = {};

interface Snapshot {
	mainSettings: string;
	design: string;
	businessInfo: string;
	bio: string;
	imageGallery: string;
	services: string;
	pricing: string;
}

export const SECTION_LIST: Array<{ id: SectionId; label: string }> = [
	{ id: "mainSettings", label: "Main Page Settings" },
	{ id: "design", label: "Design" },
	{ id: "businessInfo", label: "Business Info" },
	{ id: "bio", label: "Bio" },
	{ id: "imageGallery", label: "Image Gallery" },
	{ id: "services", label: "Services" },
	{ id: "pricing", label: "Pricing" },
];

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
	ownerName,
	ownerTitle,
	isLicensed,
	isBonded,
	isInsured,
	yearEstablished,
	licenseNumber,
	certifications,
	byAppointmentOnly,
	businessSchedule,
	socialLinks,
	theme,
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
	ownerName: string;
	ownerTitle: string;
	isLicensed: boolean;
	isBonded: boolean;
	isInsured: boolean;
	yearEstablished: number | undefined;
	licenseNumber: string;
	certifications: string[];
	byAppointmentOnly: boolean;
	businessSchedule: DaySchedule[];
	socialLinks: SocialLinks;
	theme: string;
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
		design: JSON.stringify({ theme }),
		businessInfo: JSON.stringify({
			ownerName,
			ownerTitle,
			isLicensed,
			isBonded,
			isInsured,
			yearEstablished,
			licenseNumber,
			certifications,
			byAppointmentOnly,
			businessSchedule,
			socialLinks,
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

export function useCommunityPageForm() {
	const router = useRouter();
	const toast = useToast();

	// Convex queries
	const communityPage = useQuery(api.communityPages.get);
	const organization = useQuery(api.organizations.get);

	// Convex mutations
	const upsert = useMutation(api.communityPages.upsert);
	const publishMutation = useMutation(api.communityPages.publish);
	const generateUploadUrl = useMutation(api.communityPages.generateUploadUrl);
	const deleteBanner = useMutation(api.communityPages.deleteBannerImage);
	const deleteAvatar = useMutation(api.communityPages.deleteAvatarImage);

	// State
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
	const [theme, setTheme] = useState("clean-professional");

	const [bannerUrl, setBannerUrl] = useState<string | null>(null);
	const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
	const [bannerStorageId, setBannerStorageId] = useState<Id<"_storage"> | null>(
		null,
	);
	const [avatarStorageId, setAvatarStorageId] = useState<Id<"_storage"> | null>(
		null,
	);
	const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);

	// Business info state
	const [ownerName, setOwnerName] = useState("");
	const [ownerTitle, setOwnerTitle] = useState("");
	const [isLicensed, setIsLicensed] = useState(false);
	const [isBonded, setIsBonded] = useState(false);
	const [isInsured, setIsInsured] = useState(false);
	const [yearEstablished, setYearEstablished] = useState<number | undefined>(
		undefined,
	);
	const [licenseNumber, setLicenseNumber] = useState("");
	const [certifications, setCertifications] = useState<string[]>([]);
	const [byAppointmentOnly, setByAppointmentOnly] = useState(false);
	const [businessSchedule, setBusinessSchedule] =
		useState<DaySchedule[]>(DEFAULT_SCHEDULE);
	const [socialLinks, setSocialLinks] =
		useState<SocialLinks>(EMPTY_SOCIAL_LINKS);

	const [isSaving, setIsSaving] = useState(false);
	const [isPublishing, setIsPublishing] = useState(false);
	const [isUploadingBanner, setIsUploadingBanner] = useState(false);
	const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
	const [isUploadingGallery, setIsUploadingGallery] = useState(false);
	const [slugError, setSlugError] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const [debouncedSlug, setDebouncedSlug] = useState("");
	const [activeSection, setActiveSection] = useState<SectionId>("mainSettings");

	// Refs
	const bannerInputRef = useRef<HTMLInputElement>(null);
	const avatarInputRef = useRef<HTMLInputElement>(null);
	const galleryInputRef = useRef<HTMLInputElement>(null);
	const sectionRefs = useRef<Record<SectionId, HTMLElement | null>>({
		mainSettings: null,
		design: null,
		businessInfo: null,
		bio: null,
		imageGallery: null,
		services: null,
		pricing: null,
	});
	const savedSnapshotRef = useRef<Snapshot | null>(null);

	// Slug debounce
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

	// Redirect if no community page
	useEffect(() => {
		if (communityPage === null) {
			router.replace("/community");
		}
	}, [communityPage, router]);

	// Sync server data to local state
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

		// Business info sync
		const ownerInfo = communityPage.draftOwnerInfo as
			| { name?: string; title?: string }
			| undefined;
		setOwnerName(ownerInfo?.name || "");
		setOwnerTitle(ownerInfo?.title || "");

		const creds = communityPage.draftCredentials as
			| {
					isLicensed?: boolean;
					isBonded?: boolean;
					isInsured?: boolean;
					yearEstablished?: number;
					licenseNumber?: string;
					certifications?: string[];
			  }
			| undefined;
		setIsLicensed(creds?.isLicensed || false);
		setIsBonded(creds?.isBonded || false);
		setIsInsured(creds?.isInsured || false);
		setYearEstablished(creds?.yearEstablished);
		setLicenseNumber(creds?.licenseNumber || "");
		setCertifications(creds?.certifications || []);

		const hours = communityPage.draftBusinessHours as
			| { byAppointmentOnly: boolean; schedule?: DaySchedule[] }
			| undefined;
		setByAppointmentOnly(hours?.byAppointmentOnly || false);
		setBusinessSchedule(hours?.schedule || DEFAULT_SCHEDULE);

		const links = communityPage.draftSocialLinks as SocialLinks | undefined;
		setSocialLinks(links || EMPTY_SOCIAL_LINKS);

		const serverTheme = (communityPage.draftTheme as string) || "clean-professional";
		setTheme(serverTheme);

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
			ownerName: ownerInfo?.name || "",
			ownerTitle: ownerInfo?.title || "",
			isLicensed: creds?.isLicensed || false,
			isBonded: creds?.isBonded || false,
			isInsured: creds?.isInsured || false,
			yearEstablished: creds?.yearEstablished,
			licenseNumber: creds?.licenseNumber || "",
			certifications: creds?.certifications || [],
			byAppointmentOnly: hours?.byAppointmentOnly || false,
			businessSchedule: hours?.schedule || DEFAULT_SCHEDULE,
			socialLinks: links || EMPTY_SOCIAL_LINKS,
			theme: serverTheme,
		});
	}, [communityPage]);

	// Image URL queries
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

	// Validation
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

	// Image upload
	const uploadImage = useCallback(async (
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
	}, [galleryItems.length, generateUploadUrl]);

	// Snapshot comparison
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
				ownerName,
				ownerTitle,
				isLicensed,
				isBonded,
				isInsured,
				yearEstablished,
				licenseNumber,
				certifications,
				byAppointmentOnly,
				businessSchedule,
				socialLinks,
				theme,
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
			ownerName,
			ownerTitle,
			isLicensed,
			isBonded,
			isInsured,
			yearEstablished,
			licenseNumber,
			certifications,
			byAppointmentOnly,
			businessSchedule,
			socialLinks,
			theme,
		],
	);

	const dirtyBySection = useMemo(() => {
		const saved = savedSnapshotRef.current;
		if (!saved) {
			return {
				mainSettings: false,
				design: false,
				businessInfo: false,
				bio: false,
				imageGallery: false,
				services: false,
				pricing: false,
			};
		}
		return {
			mainSettings: saved.mainSettings !== currentSnapshot.mainSettings,
			design: saved.design !== currentSnapshot.design,
			businessInfo: saved.businessInfo !== currentSnapshot.businessInfo,
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

	const hasPublishableContent = useMemo(
		() =>
			!!bioContent ||
			!!servicesContent ||
			!!pricingContent ||
			pricingTiers.length > 0 ||
			galleryItems.length > 0 ||
			!!ownerName ||
			!!ownerTitle ||
			isLicensed ||
			isBonded ||
			isInsured ||
			!!yearEstablished ||
			!!licenseNumber ||
			certifications.length > 0 ||
			byAppointmentOnly ||
			Object.values(socialLinks).some(Boolean),
		[bioContent, servicesContent, pricingContent, pricingTiers.length, galleryItems.length, ownerName, ownerTitle, isLicensed, isBonded, isInsured, yearEstablished, licenseNumber, certifications.length, byAppointmentOnly, socialLinks],
	);

	const hasInvalidSocialUrls = useMemo(
		() => Object.values(socialLinks).some((url) => !!url && !isValidSocialUrl(url)),
		[socialLinks],
	);

	// Actions
	const handleSave = async () => {
		if (!validateSlug(slug)) return;
		if (hasInvalidSocialUrls) return;

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
				draftOwnerInfo:
					ownerName || ownerTitle
						? {
								name: ownerName || undefined,
								title: ownerTitle || undefined,
							}
						: undefined,
				draftCredentials:
					isLicensed ||
					isBonded ||
					isInsured ||
					yearEstablished ||
					licenseNumber ||
					certifications.length > 0
						? {
								isLicensed: isLicensed || undefined,
								isBonded: isBonded || undefined,
								isInsured: isInsured || undefined,
								yearEstablished: yearEstablished || undefined,
								licenseNumber: licenseNumber || undefined,
								certifications:
									certifications.length > 0 ? certifications : undefined,
							}
						: undefined,
				draftBusinessHours: {
					byAppointmentOnly,
					schedule: byAppointmentOnly ? undefined : businessSchedule,
				},
				draftSocialLinks: Object.values(socialLinks).some(Boolean)
					? socialLinks
					: undefined,
				draftTheme: theme,
			});

			if (isPublic) {
				await publishMutation();
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
		if (hasInvalidSocialUrls) return;

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
				draftOwnerInfo:
					ownerName || ownerTitle
						? {
								name: ownerName || undefined,
								title: ownerTitle || undefined,
							}
						: undefined,
				draftCredentials:
					isLicensed ||
					isBonded ||
					isInsured ||
					yearEstablished ||
					licenseNumber ||
					certifications.length > 0
						? {
								isLicensed: isLicensed || undefined,
								isBonded: isBonded || undefined,
								isInsured: isInsured || undefined,
								yearEstablished: yearEstablished || undefined,
								licenseNumber: licenseNumber || undefined,
								certifications:
									certifications.length > 0 ? certifications : undefined,
							}
						: undefined,
				draftBusinessHours: {
					byAppointmentOnly,
					schedule: byAppointmentOnly ? undefined : businessSchedule,
				},
				draftSocialLinks: Object.values(socialLinks).some(Boolean)
					? socialLinks
					: undefined,
				draftTheme: theme,
			});

			await publishMutation();
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
				ownerName,
				ownerTitle,
				isLicensed,
				isBonded,
				isInsured,
				yearEstablished,
				licenseNumber,
				certifications,
				byAppointmentOnly,
				businessSchedule,
				socialLinks,
				theme,
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
				ownerName,
				ownerTitle,
				isLicensed,
				isBonded,
				isInsured,
				yearEstablished,
				licenseNumber,
				certifications,
				byAppointmentOnly,
				businessSchedule,
				socialLinks,
				theme,
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

	// Stable upload handlers
	const handleBannerUpload = useCallback((file: File) => uploadImage(file, "banner"), [uploadImage]);
	const handleAvatarUpload = useCallback((file: File) => uploadImage(file, "avatar"), [uploadImage]);
	const handleGalleryUpload = useCallback((file: File) => uploadImage(file, "gallery"), [uploadImage]);

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

	return {
		// Main settings slice
		mainSettings: {
			pageTitle,
			setPageTitle,
			slug,
			setSlug,
			metaDescription,
			setMetaDescription,
			isPublic,
			setIsPublic,
			bannerStorageId,
			avatarStorageId,
			bannerUrl,
			avatarUrl,
			isUploadingBanner,
			isUploadingAvatar,
			handleBannerUpload,
			handleAvatarUpload,
			handleDeleteBanner,
			handleDeleteAvatar,
			handleSlugChange,
			slugError,
			debouncedSlug,
			isSlugAvailable,
			copied,
			handleCopyUrl,
			handleMakePrivate,
			communityPage,
			organization,
			bannerInputRef,
			avatarInputRef,
		},
		// Design slice
		design: {
			theme,
			setTheme,
		},
		// Business Info slice
		businessInfo: {
			ownerName,
			setOwnerName,
			ownerTitle,
			setOwnerTitle,
			isLicensed,
			setIsLicensed,
			isBonded,
			setIsBonded,
			isInsured,
			setIsInsured,
			yearEstablished,
			setYearEstablished,
			licenseNumber,
			setLicenseNumber,
			certifications,
			setCertifications,
			byAppointmentOnly,
			setByAppointmentOnly,
			businessSchedule,
			setBusinessSchedule,
			socialLinks,
			setSocialLinks,
		},
		// Bio slice
		bio: { bioContent, setBioContent },
		// Gallery slice
		gallery: {
			galleryItems,
			setGalleryItems,
			isUploadingGallery,
			handleGalleryUpload,
			removeGalleryItem,
			moveGalleryItem,
			galleryInputRef,
		},
		// Services slice
		services: { servicesContent, setServicesContent },
		// Pricing slice
		pricing: {
			pricingMode,
			setPricingMode,
			pricingContent,
			setPricingContent,
			pricingTiers,
			setPricingTiers,
		},
		// Actions (for header bar)
		actions: {
			handleSave,
			handlePublish,
			isSaving,
			isPublishing,
			hasUnsavedChanges,
			hasPublishableContent,
			hasInvalidSocialUrls,
			slugError,
			isSlugAvailable,
		},
		// Section navigation
		activeSection,
		setActiveSection,
		sectionRefs,
		dirtyBySection,
		// Loading state
		isLoading: communityPage === undefined,
		isRedirecting: communityPage === null,
	};
}
