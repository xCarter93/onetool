"use client";

import React from "react";
import Image from "next/image";
import {
	Upload,
	Trash2,
	Loader2,
	ImageIcon,
	Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupText,
	InputGroupInput,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { SectionShell } from "./section-shell";

interface MainSettingsSectionProps {
	pageTitle: string;
	setPageTitle: (value: string) => void;
	slug: string;
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
	organization,
	bannerInputRef,
	avatarInputRef,
	sectionRef,
}: MainSettingsSectionProps) {
	// still checking (debounce hasn't settled or query in flight)
	const isChecking =
		slug.length >= 3 &&
		(debouncedSlug !== slug || isSlugAvailable === undefined);
	// debounce settled and query returned
	const hasAvailability =
		slug.length >= 3 &&
		debouncedSlug === slug &&
		isSlugAvailable !== undefined;

	return (
		<SectionShell
			id="mainSettings"
			sectionRef={sectionRef}
			icon={Sparkles}
			title="Main Page Settings"
			description="Configure branding, URL, and SEO information."
			first
		>
			<div className="space-y-4">
				<h3 className="text-base font-semibold text-fg">Banner Image</h3>
				<div
					className={cn(
						"relative w-full aspect-[4.8/1] rounded-xl overflow-hidden border border-dashed border-border bg-muted/20",
						"hover:border-primary/50 hover:bg-muted/30 transition-colors duration-200 cursor-pointer group",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
						isUploadingBanner && "opacity-50 pointer-events-none",
					)}
					onClick={() => bannerInputRef.current?.click()}
					// Keyboard-operable only when empty; with an image, the focusable
					// Replace/Remove overlay buttons take over (no nested interactives).
					{...(!bannerUrl && {
						role: "button",
						tabIndex: 0,
						"aria-label": "Upload banner image",
						onKeyDown: (e: React.KeyboardEvent) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								bannerInputRef.current?.click();
							}
						},
					})}
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
								className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-4"
								onClick={(e) => e.stopPropagation()}
							>
								<Button
									variant="secondary"
									size="sm"
									onClick={() => bannerInputRef.current?.click()}
								>
									<Upload className="size-4 mr-2" />
									Replace
								</Button>
								<Button
									variant="destructive"
									size="sm"
									onClick={handleDeleteBanner}
								>
									<Trash2 className="size-4 mr-2" />
									Remove
								</Button>
							</div>
						</>
					) : (
						<div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-fg group-hover:text-fg transition-colors duration-200">
							{isUploadingBanner ? (
								<Loader2 className="size-8 animate-spin" />
							) : (
								<>
									<div className="flex size-10 items-center justify-center rounded-lg bg-muted/60 mb-1">
										<ImageIcon className="size-5 opacity-70 group-hover:opacity-100 transition-opacity duration-200" />
									</div>
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
				<h3 className="text-base font-semibold text-fg">Avatar / Logo</h3>
				<div className="flex items-center gap-6">
					<div
						className={cn(
							"relative size-24 rounded-xl overflow-hidden border border-dashed border-border bg-muted/20",
							"hover:border-primary/50 hover:bg-muted/30 transition-colors duration-200 cursor-pointer group",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
							isUploadingAvatar && "opacity-50 pointer-events-none",
						)}
						onClick={() => avatarInputRef.current?.click()}
						role="button"
						tabIndex={0}
						aria-label={
							avatarUrl ? "Replace avatar image" : "Upload avatar image"
						}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								avatarInputRef.current?.click();
							}
						}}
					>
						{avatarUrl ? (
							<>
								<Image
									src={avatarUrl}
									alt="Avatar"
									fill
									className="object-cover"
								/>
								<div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-200 flex items-center justify-center">
									<Upload className="size-5 text-white" />
								</div>
							</>
						) : (
							<div className="absolute inset-0 flex items-center justify-center text-muted-fg">
								{isUploadingAvatar ? (
									<Loader2 className="size-6 animate-spin" />
								) : (
									<div className="flex size-8 items-center justify-center rounded-lg bg-muted/60">
										<ImageIcon className="size-4 opacity-70" />
									</div>
								)}
							</div>
						)}
					</div>
					<div className="flex flex-col gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => avatarInputRef.current?.click()}
							disabled={isUploadingAvatar}
						>
							<Upload className="size-4 mr-2" />
							Upload Avatar
						</Button>
						{avatarStorageId && (
							<Button variant="ghost" size="sm" onClick={handleDeleteAvatar}>
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
				<Field>
					<FieldLabel htmlFor="pageTitle">Page Title</FieldLabel>
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
						<InputGroupAddon align="inline-start">
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
								!!slugError || (!slugError && isSlugAvailable === false)
							}
						/>
						<InputGroupAddon align="inline-end">
							{isChecking ? (
								<Loader2 className="size-4 animate-spin text-muted-fg" />
							) : hasAvailability ? (
								<InputGroupText className="gap-1.5">
									<span
										className={cn(
											"size-2 rounded-full",
											isSlugAvailable ? "bg-emerald-500" : "bg-red-500",
										)}
									/>
									<span
										className={cn(
											"text-xs font-medium",
											isSlugAvailable
												? "text-emerald-600 dark:text-emerald-400"
												: "text-red-600 dark:text-red-400",
										)}
									>
										{isSlugAvailable ? "Available" : "Taken"}
									</span>
								</InputGroupText>
							) : null}
						</InputGroupAddon>
					</InputGroup>
					{slugError && (
						<FieldDescription className="text-danger">
							{slugError}
						</FieldDescription>
					)}
				</Field>

				<Field className="lg:col-span-2">
					<FieldLabel htmlFor="metaDescription">
						SEO Description
					</FieldLabel>
					<Input
						id="metaDescription"
						value={metaDescription}
						onChange={(e) => setMetaDescription(e.target.value)}
						placeholder="A brief description for search engines (optional)"
					/>
					<FieldDescription>
						{metaDescription.length}/160 characters recommended
					</FieldDescription>
				</Field>
			</div>
		</SectionShell>
	);
});
