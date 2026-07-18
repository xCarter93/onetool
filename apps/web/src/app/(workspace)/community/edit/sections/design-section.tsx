"use client";

import { Palette } from "lucide-react";

import { SectionShell } from "./section-shell";
import { ThemeCard } from "../components/theme-card";

interface DesignSectionProps {
	theme: string;
	setTheme: (theme: string) => void;
	sectionRef: (el: HTMLElement | null) => void;
}

const THEMES = [
	{
		id: "clean-professional",
		label: "Clean Professional",
		description: "Minimal and polished. Lets your work speak for itself.",
	},
	{
		id: "bold-expressive",
		label: "Bold & Expressive",
		description: "Strong visual presence with accent details.",
	},
	{
		id: "warm-approachable",
		label: "Warm & Approachable",
		description: "Friendly and inviting. Builds personal connection.",
	},
] as const;

export function DesignSection({
	theme,
	setTheme,
	sectionRef,
}: DesignSectionProps) {
	return (
		<SectionShell
			id="design"
			sectionRef={sectionRef}
			icon={Palette}
			title="Design"
			description="Choose a visual style for your public page."
		>
			<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
				{THEMES.map((t) => (
					<ThemeCard
						key={t.id}
						id={t.id}
						label={t.label}
						description={t.description}
						isSelected={theme === t.id}
						onSelect={() => setTheme(t.id)}
					/>
				))}
			</div>
		</SectionShell>
	);
}
