"use client";

import React from "react";
import type { LucideIcon } from "lucide-react";
import {
	Facebook,
	Instagram,
	Youtube,
	Linkedin,
	Globe,
	ShieldCheck,
	Handshake,
	BadgeCheck,
	Check,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { StyledInput } from "@/components/ui/styled/styled-input";
import { StyledTagsInput } from "@/components/ui/styled/styled-tags-input";
import { Switch } from "@/components/ui/switch";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { DaySchedule, SocialLinks } from "../use-community-page-form";
import { isValidUrl } from "@/lib/validators";

interface BusinessInfoSectionProps {
	// Owner Info
	ownerName: string;
	setOwnerName: (v: string) => void;
	ownerTitle: string;
	setOwnerTitle: (v: string) => void;
	// Credentials
	isLicensed: boolean;
	setIsLicensed: (v: boolean) => void;
	isBonded: boolean;
	setIsBonded: (v: boolean) => void;
	isInsured: boolean;
	setIsInsured: (v: boolean) => void;
	yearEstablished: number | undefined;
	setYearEstablished: (v: number | undefined) => void;
	licenseNumber: string;
	setLicenseNumber: (v: string) => void;
	certifications: string[];
	setCertifications: React.Dispatch<React.SetStateAction<string[]>>;
	// Hours
	byAppointmentOnly: boolean;
	setByAppointmentOnly: (v: boolean) => void;
	businessSchedule: DaySchedule[];
	setBusinessSchedule: React.Dispatch<React.SetStateAction<DaySchedule[]>>;
	// Social Links
	socialLinks: SocialLinks;
	setSocialLinks: React.Dispatch<React.SetStateAction<SocialLinks>>;
	// Section ref
	sectionRef: (el: HTMLElement | null) => void;
}

const TIME_OPTIONS: Array<{ value: string; label: string }> = (() => {
	const options: Array<{ value: string; label: string }> = [];
	for (let h = 0; h < 24; h++) {
		for (const m of [0, 30]) {
			const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
			const period = h < 12 ? "AM" : "PM";
			const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
			const label = `${hour12}:${String(m).padStart(2, "0")} ${period}`;
			options.push({ value, label });
		}
	}
	return options;
})();

const SOCIAL_PLATFORMS = [
	{
		key: "facebook" as const,
		label: "Facebook",
		placeholder: "https://facebook.com/yourbusiness",
		icon: Facebook,
	},
	{
		key: "instagram" as const,
		label: "Instagram",
		placeholder: "https://instagram.com/yourbusiness",
		icon: Instagram,
	},
	{
		key: "nextdoor" as const,
		label: "Nextdoor",
		placeholder: "https://nextdoor.com/pages/yourbusiness",
		icon: Globe,
	},
	{
		key: "youtube" as const,
		label: "YouTube",
		placeholder: "https://youtube.com/@yourbusiness",
		icon: Youtube,
	},
	{
		key: "linkedin" as const,
		label: "LinkedIn",
		placeholder: "https://linkedin.com/company/yourbusiness",
		icon: Linkedin,
	},
	{
		key: "yelp" as const,
		label: "Yelp",
		placeholder: "https://yelp.com/biz/yourbusiness",
		icon: Globe,
	},
	{
		key: "google" as const,
		label: "Google",
		placeholder: "https://g.page/yourbusiness",
		icon: Globe,
	},
] as const;


/**
 * Individual social link input — own render boundary so typing in one
 * doesn't re-render the other 6. Validation computed directly in render.
 */
const SocialLinkInput = React.memo(function SocialLinkInput({
	placeholder,
	icon: Icon,
	value,
	onChange,
}: {
	placeholder: string;
	icon: LucideIcon;
	value: string;
	onChange: (value: string) => void;
}) {
	const invalid = !!value.trim() && !isValidUrl(value);

	return (
		<div className="flex items-center gap-3">
			<Icon className="size-5 text-muted-foreground shrink-0" />
			<div className="flex-1">
				<div
					className={
						invalid
							? "rounded-md ring-2 ring-red-500 ring-offset-0"
							: undefined
					}
				>
					<StyledInput
						placeholder={placeholder}
						value={value}
						onChange={(e) => onChange(e.target.value)}
					/>
				</div>
				{invalid && (
					<p className="text-xs text-red-600 dark:text-red-400 mt-1">
						Please enter a valid URL (e.g. https://example.com)
					</p>
				)}
			</div>
		</div>
	);
});

export const BusinessInfoSection = React.memo(function BusinessInfoSection({
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
	sectionRef,
}: BusinessInfoSectionProps) {
	const currentYear = new Date().getFullYear();

	const updateSchedule = (
		index: number,
		updates: Partial<DaySchedule>,
	) => {
		setBusinessSchedule((prev) =>
			prev.map((item, i) => (i === index ? { ...item, ...updates } : item)),
		);
	};

	return (
		<section id="businessInfo" ref={sectionRef} className="scroll-mt-48">
			<h2 className="text-lg font-semibold text-fg mb-6">Business Info</h2>

			{/* Owner Info */}
			<div className="space-y-4 mb-8">
				<h3 className="text-sm font-medium text-muted-fg uppercase tracking-wider">
					Owner Info
				</h3>
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
					<div className="space-y-1.5">
						<Label htmlFor="ownerName">Your Name</Label>
						<StyledInput
							id="ownerName"
							placeholder="e.g., Jane Doe"
							value={ownerName}
							onChange={(e) => setOwnerName(e.target.value)}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="ownerTitle">Your Title</Label>
						<StyledInput
							id="ownerTitle"
							placeholder="e.g., Owner & Operator"
							value={ownerTitle}
							onChange={(e) => setOwnerTitle(e.target.value)}
						/>
					</div>
				</div>
			</div>

			{/* Credentials */}
			<div className="space-y-4 mb-8">
				<h3 className="text-sm font-medium text-muted-fg uppercase tracking-wider">
					Credentials
				</h3>
				<div className="flex flex-wrap gap-4">
					{([
						{ label: "Licensed", icon: ShieldCheck, checked: isLicensed, toggle: setIsLicensed },
						{ label: "Bonded", icon: Handshake, checked: isBonded, toggle: setIsBonded },
						{ label: "Insured", icon: BadgeCheck, checked: isInsured, toggle: setIsInsured },
					] as const).map((cred) => (
						<button
							key={cred.label}
							type="button"
							onClick={() => cred.toggle(!cred.checked)}
							className={`group relative flex flex-col items-center justify-center w-28 sm:w-32 p-5 rounded-2xl border transition-all duration-300 ease-in-out transform hover:scale-105 hover:z-10 shadow-sm hover:shadow-md cursor-pointer select-none ${
								cred.checked
									? "bg-gradient-to-br from-primary/15 to-primary/25 border-primary/50 ring-2 ring-primary/30 shadow-primary/10"
									: "bg-card/80 border-border/60 hover:border-primary/30 hover:bg-card/90"
							}`}
						>
							{cred.checked && (
								<div className="absolute -top-2 -right-2 w-6 h-6 bg-gradient-to-br from-primary to-primary/80 rounded-full flex items-center justify-center shadow-md ring-2 ring-background">
									<Check className="w-3.5 h-3.5 text-primary-foreground" />
								</div>
							)}
							<cred.icon
								className={`w-8 h-8 mb-2 transition-all duration-300 ${
									cred.checked
										? "text-primary"
										: "text-muted-fg group-hover:text-primary"
								}`}
							/>
							<span
								className={`text-sm font-semibold tracking-wide transition-colors duration-200 ${
									cred.checked
										? "text-primary"
										: "text-fg group-hover:text-primary"
								}`}
							>
								{cred.label}
							</span>
						</button>
					))}
				</div>
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
					<div className="space-y-1.5">
						<Label htmlFor="yearEstablished">Year Established</Label>
						<StyledInput
							id="yearEstablished"
							type="number"
							placeholder="e.g., 2015"
							min={1800}
							max={currentYear}
							value={yearEstablished ?? ""}
							onChange={(e) => {
								const val = e.target.value;
								if (!val) {
									setYearEstablished(undefined);
								} else {
									const num = parseInt(val, 10);
									if (!isNaN(num)) setYearEstablished(num);
								}
							}}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="licenseNumber">License Number</Label>
						<StyledInput
							id="licenseNumber"
							placeholder="e.g., ABC-123456"
							value={licenseNumber}
							onChange={(e) => setLicenseNumber(e.target.value)}
						/>
					</div>
				</div>
				<div className="space-y-1.5">
					<Label>Additional Certifications</Label>
					<StyledTagsInput
						tags={certifications}
						setTags={setCertifications}
						placeholder="Type a certification and press Enter"
					/>
				</div>
			</div>

			{/* Business Hours */}
			<div className="space-y-4 mb-8">
				<h3 className="text-sm font-medium text-muted-fg uppercase tracking-wider">
					Business Hours
				</h3>
				<div className="flex items-center gap-3 mb-4">
					<Switch
						checked={byAppointmentOnly}
						onCheckedChange={setByAppointmentOnly}
					/>
					<Label>By Appointment Only</Label>
				</div>
				{!byAppointmentOnly && (
					<div className="space-y-3">
						{businessSchedule.map((day, index) => (
							<div
								key={day.day}
								className="grid grid-cols-[100px_1fr_1fr_auto] items-center gap-3"
							>
								<span className="text-sm font-medium text-fg">
									{day.day}
								</span>
								<Select
									value={day.open}
									onValueChange={(v) =>
										updateSchedule(index, { open: v })
									}
									disabled={day.isClosed}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{TIME_OPTIONS.map((opt) => (
											<SelectItem key={opt.value} value={opt.value}>
												{opt.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<Select
									value={day.close}
									onValueChange={(v) =>
										updateSchedule(index, { close: v })
									}
									disabled={day.isClosed}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{TIME_OPTIONS.map((opt) => (
											<SelectItem key={opt.value} value={opt.value}>
												{opt.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<div className="flex items-center gap-2">
									<Switch
										checked={day.isClosed}
										onCheckedChange={(v) =>
											updateSchedule(index, { isClosed: v })
										}
										size="sm"
									/>
									<span className="text-xs text-muted-fg">Closed</span>
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			{/* Social Links */}
			<div className="space-y-4">
				<h3 className="text-sm font-medium text-muted-fg uppercase tracking-wider">
					Social Links
				</h3>
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
					{SOCIAL_PLATFORMS.map((platform) => (
						<SocialLinkInput
							key={platform.key}
							placeholder={platform.placeholder}
							icon={platform.icon}
							value={socialLinks[platform.key] || ""}
							onChange={(val) =>
								setSocialLinks((prev) => ({
									...prev,
									[platform.key]: val,
								}))
							}
						/>
					))}
				</div>
			</div>
		</section>
	);
});
