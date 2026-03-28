"use client";

import React from "react";
import type { JSONContent } from "@tiptap/react";
import { CommunityEditor } from "@/components/tiptap/community-editor";

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
		<section
			id="bio"
			ref={sectionRef}
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
	);
});
