"use client";

import React from "react";
import Image from "next/image";
import {
	Trash2,
	Loader2,
	ImageIcon,
	ChevronUp,
	ChevronDown,
	Plus,
} from "lucide-react";

import { StyledButton } from "@/components/ui/styled/styled-button";
import { StyledBadge } from "@/components/ui/styled/styled-badge";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { MAX_GALLERY_IMAGES, type GalleryItem } from "../use-community-page-form";

interface GallerySectionProps {
	galleryItems: GalleryItem[];
	isUploadingGallery: boolean;
	handleGalleryUpload: (file: File) => void;
	removeGalleryItem: (storageId: Id<"_storage">) => void;
	moveGalleryItem: (index: number, direction: -1 | 1) => void;
	galleryInputRef: React.RefObject<HTMLInputElement | null>;
	sectionRef: (el: HTMLElement | null) => void;
}

export const GallerySection = React.memo(function GallerySection({
	galleryItems,
	isUploadingGallery,
	handleGalleryUpload,
	removeGalleryItem,
	moveGalleryItem,
	galleryInputRef,
	sectionRef,
}: GallerySectionProps) {
	return (
		<section
			id="imageGallery"
			ref={sectionRef}
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
					if (file) void handleGalleryUpload(file);
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
							className="group relative rounded-xl overflow-hidden border border-border/60 bg-background"
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
	);
});
