"use client";

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
		<section
			id="design"
			ref={sectionRef}
			className="border-t border-border/40 pt-12 space-y-6"
		>
			<div>
				<h2 className="text-lg font-semibold text-fg">Page Design</h2>
				<p className="text-sm text-muted-fg mt-1">
					Choose a visual style for your public page.
				</p>
			</div>

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
		</section>
	);
}
