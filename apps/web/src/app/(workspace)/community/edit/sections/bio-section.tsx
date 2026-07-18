"use client";

import React from "react";
import { FileText } from "lucide-react";
import type { JSONContent } from "@tiptap/react";
import { CommunityEditor } from "@/components/tiptap/community-editor";
import { SectionShell } from "./section-shell";

interface BioSectionProps {
	bioContent: JSONContent | undefined;
	setBioContent: (content: JSONContent | undefined) => void;
	sectionRef: (el: HTMLElement | null) => void;
}

export const BioSection = React.memo(function BioSection({
	bioContent,
	setBioContent,
	sectionRef,
}: BioSectionProps) {
	return (
		<SectionShell
			id="bio"
			sectionRef={sectionRef}
			icon={FileText}
			title="Bio"
			description="Tell visitors who you are and what makes your business unique."
		>
			<CommunityEditor
				content={bioContent}
				onChange={setBioContent}
				placeholder="Share your story, background, and core values..."
			/>
		</SectionShell>
	);
});
