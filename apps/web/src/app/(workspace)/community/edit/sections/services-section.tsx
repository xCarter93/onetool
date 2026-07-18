"use client";

import React from "react";
import { Wrench } from "lucide-react";
import type { JSONContent } from "@tiptap/react";
import { CommunityEditor } from "@/components/tiptap/community-editor";
import { SectionShell } from "./section-shell";

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
		</SectionShell>
	);
});
