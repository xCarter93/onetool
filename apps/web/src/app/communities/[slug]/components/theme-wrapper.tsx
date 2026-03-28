import { cn } from "@/lib/utils";

export type Theme =
	| "clean-professional"
	| "bold-expressive"
	| "warm-approachable";

export const THEME_CLASSES: Record<
	Theme,
	{
		trustBar: string;
		sectionHeading: string;
		card: string;
		heroOverlay: string;
	}
> = {
	"clean-professional": {
		trustBar: "bg-muted/30 border-b border-border/40",
		sectionHeading: "text-fg",
		card: "border border-border/60 bg-card/40",
		heroOverlay: "from-bg via-bg/60 to-transparent",
	},
	"bold-expressive": {
		trustBar: "bg-primary/5 border-b-2 border-primary/20",
		sectionHeading: "text-fg border-l-4 border-primary pl-4",
		card: "border border-border bg-card shadow-sm",
		heroOverlay: "from-black/70 via-black/40 to-transparent",
	},
	"warm-approachable": {
		trustBar:
			"bg-amber-50/60 dark:bg-amber-950/20 border-b border-amber-200/40 dark:border-amber-800/30",
		sectionHeading: "text-fg",
		card: "rounded-2xl border border-border/40 bg-card/60",
		heroOverlay: "from-bg via-bg/50 to-transparent",
	},
};

export const THEME_TYPOGRAPHY: Record<
	Theme,
	{
		display: string;
		heading: string;
		label: string;
		body: string;
	}
> = {
	"clean-professional": {
		display:
			"text-[30px] sm:text-[36px] md:text-[40px] font-bold leading-[1.1]",
		heading: "text-[24px] font-bold leading-[1.25]",
		label: "text-[14px] font-normal leading-[1.4]",
		body: "text-[16px] font-normal leading-[1.6]",
	},
	"bold-expressive": {
		display:
			"text-[32px] sm:text-[40px] md:text-[48px] font-bold leading-[1.05]",
		heading: "text-[28px] font-bold leading-[1.2]",
		label: "text-[14px] font-bold leading-[1.4]",
		body: "text-[16px] font-normal leading-[1.6]",
	},
	"warm-approachable": {
		display:
			"text-[28px] sm:text-[32px] md:text-[36px] font-bold leading-[1.15]",
		heading: "text-[22px] font-bold leading-[1.3]",
		label: "text-[14px] font-normal leading-[1.5]",
		body: "text-[16px] font-normal leading-[1.65]",
	},
};

const VALID_THEMES: ReadonlySet<string> = new Set<string>([
	"clean-professional",
	"bold-expressive",
	"warm-approachable",
]);

export function getTheme(publishedTheme: string | undefined): Theme {
	if (publishedTheme && VALID_THEMES.has(publishedTheme)) {
		return publishedTheme as Theme;
	}
	return "clean-professional";
}

export function ThemeWrapper({
	theme,
	children,
}: {
	theme: Theme;
	children: React.ReactNode;
}) {
	return <div data-theme={theme}>{children}</div>;
}
