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
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { TagsInput } from "@/components/shared/tags-input";
import { Switch } from "@/components/ui/switch";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { SectionShell } from "./section-shell";
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
						invalid ? "rounded-md ring-2 ring-danger ring-offset-0" : undefined
					}
				>
					<Input
						placeholder={placeholder}
						value={value}
						onChange={(e) => onChange(e.target.value)}
					/>
				</div>
				{invalid && (
					<p className="text-xs text-danger mt-1">
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

	const sublabelClass =
		"text-[11px] font-semibold uppercase tracking-wider text-muted-fg";

	return (
		<SectionShell
			id="businessInfo"
			sectionRef={sectionRef}
			icon={BadgeCheck}
			title="Business Info"
			description="Tell clients who they'll be working with."
		>
			{/* Owner Info */}
			<div className="space-y-4">
				<h3 className={sublabelClass}>Owner Info</h3>
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
					<Field>
						<FieldLabel htmlFor="ownerName">Your Name</FieldLabel>
						<Input
							id="ownerName"
							placeholder="e.g., Jane Doe"
							value={ownerName}
							onChange={(e) => setOwnerName(e.target.value)}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="ownerTitle">Your Title</FieldLabel>
						<Input
							id="ownerTitle"
							placeholder="e.g., Owner & Operator"
							value={ownerTitle}
							onChange={(e) => setOwnerTitle(e.target.value)}
						/>
					</Field>
				</div>
			</div>

			{/* Credentials */}
			<div className="space-y-4 border-t border-border/40 pt-6">
				<h3 className={sublabelClass}>Credentials</h3>
				<div className="flex flex-wrap gap-3">
					{([
						{ label: "Licensed", icon: ShieldCheck, checked: isLicensed, toggle: setIsLicensed },
						{ label: "Bonded", icon: Handshake, checked: isBonded, toggle: setIsBonded },
						{ label: "Insured", icon: BadgeCheck, checked: isInsured, toggle: setIsInsured },
					] as const).map((cred) => (
						<button
							key={cred.label}
							type="button"
							aria-pressed={cred.checked}
							onClick={() => cred.toggle(!cred.checked)}
							className={`group relative flex flex-col items-center justify-center w-28 sm:w-32 p-4 rounded-xl border cursor-pointer select-none transition-colors duration-200 ${
								cred.checked
									? "border-primary/40 bg-primary/10"
									: "border-border/60 bg-card/60 hover:border-primary/30 hover:bg-card/90"
							}`}
						>
							{cred.checked && (
								<div className="absolute -top-2 -right-2 size-5 bg-primary rounded-full flex items-center justify-center ring-2 ring-background">
									<Check className="size-3 text-primary-foreground" />
								</div>
							)}
							<cred.icon
								className={`size-7 mb-2 transition-colors duration-200 ${
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
					<Field>
						<FieldLabel htmlFor="yearEstablished">Year Established</FieldLabel>
						<Input
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
					</Field>
					<Field>
						<FieldLabel htmlFor="licenseNumber">License Number</FieldLabel>
						<Input
							id="licenseNumber"
							placeholder="e.g., ABC-123456"
							value={licenseNumber}
							onChange={(e) => setLicenseNumber(e.target.value)}
						/>
					</Field>
				</div>
				<Field>
					<FieldLabel>Additional Certifications</FieldLabel>
					<TagsInput
						tags={certifications}
						setTags={setCertifications}
						placeholder="Type a certification and press Enter"
					/>
				</Field>
			</div>

			{/* Business Hours */}
			<div className="space-y-4 border-t border-border/40 pt-6">
				<h3 className={sublabelClass}>Business Hours</h3>
				<div className="flex items-center gap-3">
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
										updateSchedule(index, { open: v ?? day.open })
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
										updateSchedule(index, { close: v ?? day.close })
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
			<div className="space-y-4 border-t border-border/40 pt-6">
				<h3 className={sublabelClass}>Social Links</h3>
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
		</SectionShell>
	);
});
