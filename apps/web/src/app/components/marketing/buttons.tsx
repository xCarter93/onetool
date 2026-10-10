import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const LP_BUTTON_BASE =
	"inline-flex cursor-pointer items-center justify-center gap-2 rounded-md font-semibold tracking-[-0.01em] motion-reduce:transition-none " +
	"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink) focus-visible:ring-offset-2 focus-visible:ring-offset-(--paper) " +
	"disabled:pointer-events-none disabled:opacity-60";

export const LP_PRIMARY = `lp-cta ${LP_BUTTON_BASE}`;

export const LP_SECONDARY = `lp-ghost ${LP_BUTTON_BASE}`;

export const LP_BUTTON_SIZE = {
	sm: "lp-btn-sm",
	md: "lp-btn-md",
} as const;

type ButtonProps = {
	href: string;
	size?: keyof typeof LP_BUTTON_SIZE;
	className?: string;
	children: ReactNode;
};

export function PrimaryButton({
	href,
	size = "md",
	className,
	children,
}: ButtonProps) {
	return (
		// Plain <a>: landing <-> app must be a full page load (separate Tailwind sheets).
		<a href={href} className={cn(LP_PRIMARY, LP_BUTTON_SIZE[size], className)}>
			{children}
		</a>
	);
}

export function SecondaryButton({
	href,
	size = "md",
	className,
	children,
}: ButtonProps) {
	return (
		<a href={href} className={cn(LP_SECONDARY, LP_BUTTON_SIZE[size], className)}>
			{children}
		</a>
	);
}
