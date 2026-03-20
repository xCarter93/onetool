"use client";

import React from "react";
import type { JSONContent } from "@tiptap/react";
import { CommunityEditor } from "@/components/tiptap/community-editor";

interface ServicesSectionProps {
	servicesContent: JSONContent | undefined;
	setServicesContent: (content: JSONContent | undefined) => void;
	sectionRef: (el: HTMLElement | null) => void;
}

export const ServicesSection = React.memo(function ServicesSection({
	servicesContent,
	setServicesContent,
	sectionRef,
}: ServicesSectionProps) {
	return (
		<section
			id="services"
			ref={sectionRef}
			className="scroll-mt-44"
		>
			<div className="mb-4">
				<h2 className="text-lg font-semibold text-fg">Services</h2>
				<p className="text-sm text-muted-fg">
					Describe your services and what clients can expect.
				</p>
			</div>
			<CommunityEditor
				content={servicesContent}
				onChange={setServicesContent}
				placeholder="List services, specialties, and service areas..."
			/>
		</section>
	);
});
