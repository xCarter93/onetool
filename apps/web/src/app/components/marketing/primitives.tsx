import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/* Shared building blocks of the landing's paper-and-ink language. The type
 * scale lives HERE (SectionHeading/Lede/Eyebrow), not in section files, so
 * every section drifts together or not at all. Tokens come from landing.css
 * (`.dc-landing` scope); components reference them via Tailwind v4 var
 * utilities — `text-(--ink-2)`, never raw hex. */

export function Container({
	className,
	children,
}: {
	className?: string;
	children: ReactNode;
}) {
	return (
		<div className={cn("mx-auto max-w-[1280px] px-[clamp(20px,4vw,40px)]", className)}>
			{children}
		</div>
	);
}

/** Section shell: hairline seam below, optional re-inking (Twenty's scheme pattern). */
export function Section({
	id,
	scheme = "paper",
	className,
	containerClassName,
	pad = "default",
	children,
}: {
	id?: string;
	scheme?: "paper" | "sheet" | "dark";
	className?: string;
	containerClassName?: string;
	/** default = the comp's big section rhythm; tight = band rhythm; none = caller owns padding. */
	pad?: "default" | "tight" | "none";
	children: ReactNode;
}) {
	return (
		<section
			id={id}
			className={cn(
				"relative border-b border-(--rule)",
				scheme === "sheet" && "bg-(--sheet)",
				scheme === "dark" && "lp-scheme-dark",
				className
			)}
		>
			<Container
				className={cn(
					"relative",
					pad === "default" && "py-[clamp(56px,7vw,104px)]",
					pad === "tight" && "py-[clamp(40px,5vw,72px)]",
					containerClassName
				)}
			>
				{children}
			</Container>
		</section>
	);
}

/** Mono eyebrow with the 14×7 accent marker — every section opens with one. */
export function Eyebrow({
	children,
	tone = "accent",
	className,
}: {
	children: ReactNode;
	tone?: "accent" | "dim";
	className?: string;
}) {
	return (
		<p
			className={cn(
				"inline-flex items-center gap-[9px] font-mono text-[11.5px] font-medium uppercase tracking-[0.06em]",
				tone === "accent" ? "text-(--accent-ink)" : "text-(--ink-3)",
				className
			)}
		>
			<span
				aria-hidden="true"
				className="inline-block h-[7px] w-[14px] flex-none rounded-[1px] bg-(--accent)"
			/>
			{children}
		</p>
	);
}

/** Section H2. lg = major section, md = band, sm = utility section. */
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
				"mt-4 font-semibold text-balance",
				size === "lg" &&
					"text-[clamp(30px,4.2vw,52px)] leading-[1.04] tracking-[-0.035em] max-w-[20ch]",
				size === "md" &&
					"text-[clamp(28px,3.6vw,46px)] leading-[1.06] tracking-[-0.035em]",
				size === "sm" &&
					"text-[clamp(24px,2.8vw,34px)] leading-[1.1] tracking-[-0.03em]",
				className
			)}
		>
			{children}
		</Tag>
	);
}

/** Supporting paragraph under a heading. */
export function Lede({
	className,
	children,
}: {
	className?: string;
	children: ReactNode;
}) {
	return (
		<p
			className={cn(
				"text-[17px] leading-[1.6] text-(--ink-2) text-pretty",
				className
			)}
		>
			{children}
		</p>
	);
}

const PLUS_PATH = "M1.5 7.5H13.5M7.5 13.5V1.5";

export function PlusMark({
	size = 14,
	className,
}: {
	size?: number;
	className?: string;
}) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 15 15"
			fill="none"
			overflow="visible"
			className={cn("block", className)}
		>
			<path d={PLUS_PATH} stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
		</svg>
	);
}

/** Four accent plus-marks straddling a card's corners. FEATURED cards only —
 * hero ledger, "One record", Business plan, final CTA, OneTool compare column. */
export function PlusCorners({ className }: { className?: string }) {
	const spot = (pos: string) => (
		<span
			aria-hidden="true"
			className={cn(
				"pointer-events-none absolute z-[2] leading-none text-(--accent)",
				pos,
				className
			)}
		>
			<PlusMark />
		</span>
	);
	return (
		<>
			{spot("-left-[7.5px] -top-[7.5px]")}
			{spot("-right-[7.5px] -top-[7.5px]")}
			{spot("-left-[7.5px] -bottom-[7.5px]")}
			{spot("-right-[7.5px] -bottom-[7.5px]")}
		</>
	);
}

/** Plus-tipped measuring rule with a centred mono label. */
export function DimensionLine({
	label,
	className,
}: {
	label: ReactNode;
	className?: string;
}) {
	return (
		<div
			aria-hidden="true"
			className={cn("flex items-center gap-1.5 text-(--rule-3)", className)}
		>
			<span className="flex-none leading-none text-(--accent)">
				<PlusMark size={12} />
			</span>
			<span className="h-px flex-1 bg-current" />
			<span className="whitespace-nowrap px-3 font-mono text-[11px] uppercase tracking-[0.1em] text-(--ink-3)">
				{label}
			</span>
			<span className="h-px flex-1 bg-current" />
			<span className="flex-none leading-none text-(--accent)">
				<PlusMark size={12} />
			</span>
		</div>
	);
}

/** ✓ trust/benefit row item. */
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
			<span
				aria-hidden="true"
				className={cn(
					"font-bold",
					tone === "paid" ? "text-(--paid)" : "text-(--ink-3)"
				)}
			>
				✓
			</span>
			{children}
		</li>
	);
}

/** Faint construction-grid backdrop. One per section at most; always masked. */
export function GridBackdrop({
	size = 64,
	mask = "radial-gradient(120% 80% at 78% 22%, #000 0%, transparent 60%)",
	opacity = 0.5,
	className,
}: {
	size?: number;
	mask?: string;
	opacity?: number;
	className?: string;
}) {
	const style: CSSProperties = {
		backgroundImage:
			"linear-gradient(to right, var(--rule) 1px, transparent 1px), linear-gradient(to bottom, var(--rule) 1px, transparent 1px)",
		backgroundSize: `${size}px ${size}px`,
		WebkitMaskImage: mask,
		maskImage: mask,
		opacity,
	};
	return (
		<div
			aria-hidden="true"
			className={cn("pointer-events-none absolute inset-0", className)}
			style={style}
		/>
	);
}

/** Card-header eyebrow row used by the What's-inside cards. */
export function CardEyebrowRow({
	label,
	index,
	className,
}: {
	label: ReactNode;
	index: string;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex items-center justify-between gap-3 border-b border-(--rule) px-[22px] py-[13px]",
				className
			)}
		>
			<span className="inline-flex items-center gap-[9px] font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-(--accent-ink)">
				<span
					aria-hidden="true"
					className="h-[7px] w-[14px] flex-none rounded-[1px] bg-(--accent)"
				/>
				{label}
			</span>
			<span className="font-mono text-[11px] tabular-nums text-(--ink-3)">{index}</span>
		</div>
	);
}
