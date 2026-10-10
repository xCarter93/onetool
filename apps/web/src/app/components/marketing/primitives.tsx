import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

/* Shared landing building blocks; the type scale lives in landing.css so every section moves together. */

export function Container({
	className,
	children,
}: {
	className?: string;
	children: ReactNode;
}) {
	return (
		<div className={cn("mx-auto max-w-[1560px] px-(--lp-gutter)", className)}>
			{children}
		</div>
	);
}

export function Section({
	id,
	scheme = "paper",
	className,
	containerClassName,
	pad = "default",
	divider = false,
	children,
}: {
	id?: string;
	scheme?: "paper" | "sheet";
	className?: string;
	containerClassName?: string;
	/** none = the caller owns padding. */
	pad?: "default" | "tight" | "none";
	/** Only where two same-scheme sections meet; a scheme swap already reads as a seam. */
	divider?: boolean;
	children: ReactNode;
}) {
	return (
		<section
			id={id}
			className={cn(
				"relative",
				divider && "border-b border-(--rule)",
				scheme === "sheet" && "bg-(--sheet)",
				className
			)}
		>
			<Container
				className={cn(
					"relative",
					pad === "default" && "py-[clamp(64px,8vw,120px)]",
					pad === "tight" && "py-[clamp(44px,5.5vw,80px)]",
					containerClassName
				)}
			>
				{children}
			</Container>
		</section>
	);
}

export function SectionHeading({
	as: Tag = "h2",
	size = "lg",
	className,
	children,
}: {
	as?: "h1" | "h2" | "h3";
	size?: "lg" | "md" | "sm";
	className?: string;
	children: ReactNode;
}) {
	return (
		<Tag
			className={cn(
				"mt-4",
				size === "sm" ? "lp-h2-sm" : "lp-h2",
				size === "lg" ? "max-w-[18ch]" : "max-w-[22ch]",
				className
			)}
		>
			{children}
		</Tag>
	);
}

export function Em({ children }: { children: ReactNode }) {
	return <span className="lp-em">{children}</span>;
}

export function Lede({ className, children }: { className?: string; children: ReactNode }) {
	return <p className={cn("lp-lede mt-4", className)}>{children}</p>;
}

export function CheckItem({
	children,
	className,
	tone = "paid",
}: {
	children: ReactNode;
	className?: string;
	tone?: "paid" | "dim";
}) {
	return (
		<li className={cn("flex items-center gap-[7px] text-sm text-(--ink-2)", className)}>
			<Check
				aria-hidden="true"
				size={16}
				strokeWidth={2.5}
				className={cn("mt-[calc((1lh-1rem)/2)] flex-none self-start", tone === "paid" ? "text-(--paid)" : "text-(--ink-3)")}
			/>
			{children}
		</li>
	);
}
