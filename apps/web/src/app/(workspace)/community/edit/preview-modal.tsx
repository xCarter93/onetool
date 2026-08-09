"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import type { JSONContent } from "@tiptap/react";
import {
	CommunityPageView,
	type CommunityPageViewData,
} from "@/app/communities/[slug]/community-page-view";

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
	sectionConfig: Array<{ id: string; visible: boolean }>;
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
	theme,
	sectionConfig,
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

	// Preview mode never submits a real lead, so slug is unused by the view.
	const data: CommunityPageViewData = {
		slug: "",
		pageTitle,
		bioContent,
		servicesContent,
		pricingMode: pricingMode === "structured" ? "structured" : "richText",
		pricingContent,
		pricingTiers,
		galleryImages: galleryImages.filter(
			(img): img is { url: string; storageId: string; sortOrder: number } =>
				img.url !== null,
		),
		theme,
		sectionConfig,
		bannerUrl,
		avatarUrl,
		organization,
		ownerInfo,
		credentials,
		businessHours,
		socialLinks,
	};

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

			<CommunityPageView data={data} preview />
		</div>
	);
}
