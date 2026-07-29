"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { forwardRef } from "react";

/**
 * Marketing-only solid primary CTA.
 *
 * Deliberately does NOT use `ui/button` — the workspace's nova layer repaints
 * `.cn-button-variant-default` into a frosted `bg-primary/10` pill, which is
 * exactly the treatment this replaces. Scoped to the landing surface so the
 * workspace button keeps its own look.
 *
 * Colour: `--cta-solid` in globals.css — the AA-verified solid sky ink
 * (white label 4.95:1; the brand #00A6F4 is 2.71:1 and stays a tint/fill).
 * Hover darkens to sky-700 / active sky-800, so contrast only ever improves.
 */
const BASE =
	"group relative inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg font-semibold text-white " +
	"bg-(--cta-solid) hover:bg-(--cta-solid-hover) active:bg-(--cta-solid-active) " +
	"transition-colors duration-200 motion-reduce:transition-none " +
	"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
	"disabled:pointer-events-none disabled:opacity-60";

// Default height is 48px so mobile CTAs clear the 46px target from the PRD.
const SIZES = {
	sm: "h-9 px-4 text-sm",
	default: "h-12 px-6 text-base",
} as const;

type Size = keyof typeof SIZES;

interface CtaLinkProps {
	href: string;
	size?: Size;
	className?: string;
	children: React.ReactNode;
	/** Renders the hover-travel arrow. Defaults to true. */
	showArrow?: boolean;
}

interface CtaButtonElementProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	href?: never;
	size?: Size;
	children: React.ReactNode;
	showArrow?: boolean;
}

type CtaButtonProps = CtaLinkProps | CtaButtonElementProps;

const CtaButton = forwardRef<HTMLButtonElement, CtaButtonProps>(
	(
		{ size = "default", showArrow = true, children, className = "", ...rest },
		ref
	) => {
		const { href, ...buttonProps } = rest as React.ButtonHTMLAttributes<HTMLButtonElement> & {
			href?: string;
		};
		const cls = `${BASE} ${SIZES[size]} ${className}`.trim();

		const inner = (
			<>
				<span>{children}</span>
				{showArrow && (
					<ArrowRight
						aria-hidden="true"
						className={`${size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0`}
					/>
				)}
			</>
		);

		if (href) {
			return (
				<Link href={href} className={cls}>
					{inner}
				</Link>
			);
		}

		return (
			<button ref={ref} className={cls} {...buttonProps}>
				{inner}
			</button>
		);
	}
);

CtaButton.displayName = "CtaButton";

export { CtaButton };
