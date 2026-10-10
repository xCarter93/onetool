import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Rows subgrid so titles, bodies and panels line up across a row whatever their line counts.
export function Feature({
	as: Heading = "h3",
	title,
	body,
	label,
	className,
	stageClassName,
	children,
}: {
	as?: "h3" | "h4";
	title: string;
	body: string;
	className?: string;
	/** The panel is a picture of the product, not live UI, so assistive tech gets this summary instead. */
	label: string;
	stageClassName: string;
	children: ReactNode;
}) {
	return (
		<article className={cn("row-span-3 grid min-w-0 grid-rows-subgrid gap-y-0", className)}>
			<Heading className="lp-h3 border-t border-(--rule) pt-5 text-(--ink) md:pt-6">{title}</Heading>
			<p className="mt-2 max-w-[46ch] text-base leading-relaxed text-pretty text-(--ink-2)">{body}</p>
			<div
				role="img"
				aria-label={label}
				className={cn(
					"lp-feature-stage @container relative mt-4 min-w-0 overflow-hidden rounded-xl border border-(--rule-2) md:mt-6",
					stageClassName
				)}
			>
				{children}
			</div>
		</article>
	);
}

export function PanelBar({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<div
			className={cn(
				"flex h-11 items-center justify-between gap-3 border-b border-(--rule) px-4",
				className
			)}
		>
			{children}
		</div>
	);
}
