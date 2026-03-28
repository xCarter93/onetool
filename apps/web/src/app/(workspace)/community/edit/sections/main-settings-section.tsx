"use client";

import React from "react";
import Image from "next/image";
import {
	Upload,
	Trash2,
	Globe,
	GlobeLock,
	Copy,
	Check,
	ExternalLink,
	Loader2,
	ImageIcon,
} from "lucide-react";
import type { JSONContent } from "@tiptap/react";

import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { StyledBadge } from "@/components/ui/styled/styled-badge";
import { StyledInput } from "@/components/ui/styled/styled-input";
import { cn } from "@/lib/utils";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";

interface MainSettingsSectionProps {
	pageTitle: string;
	setPageTitle: (value: string) => void;
	slug: string;
	setSlug: (value: string) => void;
	metaDescription: string;
	setMetaDescription: (value: string) => void;
	bannerStorageId: Id<"_storage"> | null;
	avatarStorageId: Id<"_storage"> | null;
	bannerUrl: string | null;
	avatarUrl: string | null;
	isUploadingBanner: boolean;
	isUploadingAvatar: boolean;
	handleBannerUpload: (file: File) => void;
	handleAvatarUpload: (file: File) => void;
	handleDeleteBanner: () => void;
	handleDeleteAvatar: () => void;
	handleSlugChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
	slugError: string | null;
	debouncedSlug: string;
	isSlugAvailable: boolean | undefined;
	copied: boolean;
	handleCopyUrl: () => void;
	communityPage: unknown;
	organization: { name?: string; logoUrl?: string } | null | undefined;
	bannerInputRef: React.RefObject<HTMLInputElement | null>;
	avatarInputRef: React.RefObject<HTMLInputElement | null>;
	sectionRef: (el: HTMLElement | null) => void;
}

export const MainSettingsSection = React.memo(function MainSettingsSection({
	pageTitle,
	setPageTitle,
	slug,
	metaDescription,
	setMetaDescription,
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
	organization,
	bannerInputRef,
	avatarInputRef,
	sectionRef,
}: MainSettingsSectionProps) {
	const publicUrl = `${
		typeof window !== "undefined" ? window.location.origin : ""
	}/communities/${slug}`;

	return (
		<section
			id="mainSettings"
			ref={sectionRef}
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
						if (file) void handleBannerUpload(file);
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
						if (file) void handleAvatarUpload(file);
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
									"block w-full sm:w-48 rounded-r-md border border-border bg-background px-3 py-2 text-sm text-fg placeholder:text-muted-fg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent",
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

		</section>
	);
});
