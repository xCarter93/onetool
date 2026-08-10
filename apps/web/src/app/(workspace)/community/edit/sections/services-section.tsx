"use client";

import React from "react";
import { Wrench } from "lucide-react";
import type { JSONContent } from "@tiptap/react";
import { CommunityEditor } from "@/components/tiptap/community-editor";
import { TagsInput } from "@/components/shared/tags-input";
import { Badge } from "@/components/reui/badge";
import { FieldLabel, FieldDescription } from "@/components/ui/field";
import { SectionShell } from "./section-shell";
import {
	MAX_SERVICE_TAGS,
	normalizeServiceTags,
} from "../use-community-page-form";

interface ServicesSectionProps {
	servicesContent: JSONContent | undefined;
	setServicesContent: (content: JSONContent | undefined) => void;
	draftServiceTags: string[];
	setDraftServiceTags: React.Dispatch<React.SetStateAction<string[]>>;
	sectionRef: (el: HTMLElement | null) => void;
}

export const ServicesSection = React.memo(function ServicesSection({
	servicesContent,
	setServicesContent,
	draftServiceTags,
	setDraftServiceTags,
	sectionRef,
}: ServicesSectionProps) {
	const atCap = draftServiceTags.length >= MAX_SERVICE_TAGS;

	// Normalize on every write so the count/dedupe cap the backend enforces
	// can never be exceeded from this input.
	const setNormalizedServiceTags: React.Dispatch<
		React.SetStateAction<string[]>
	> = (value) => {
		setDraftServiceTags((prev) => {
			const next =
				typeof value === "function"
					? (value as (prev: string[]) => string[])(prev)
					: value;
			return normalizeServiceTags(next);
		});
	};

	return (
		<SectionShell
			id="services"
			sectionRef={sectionRef}
			icon={Wrench}
			title="Services"
			description="Describe your services and what clients can expect."
		>
			<CommunityEditor
				content={servicesContent}
				onChange={setServicesContent}
				placeholder="List services, specialties, and service areas..."
			/>

			<div className="mt-6 space-y-3">
				<div className="flex items-center justify-between gap-3">
					<FieldLabel>Service list</FieldLabel>
					<Badge
						variant={atCap ? "warning" : "default"}
						className="transition-all duration-200"
					>
						{draftServiceTags.length}/{MAX_SERVICE_TAGS}
					</Badge>
				</div>
				<FieldDescription>
					These become selectable options on your public quote form, so a
					visitor can tell you exactly what they need.
				</FieldDescription>
				<TagsInput
					tags={draftServiceTags}
					setTags={setNormalizedServiceTags}
					placeholder="Type a service and press Enter"
				/>
				{atCap && (
					<p className="text-xs text-muted-foreground">
						Maximum of {MAX_SERVICE_TAGS} tags reached — remove one to add
						another.
					</p>
				)}
			</div>
		</SectionShell>
	);
});
