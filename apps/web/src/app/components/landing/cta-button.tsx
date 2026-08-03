"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { forwardRef } from "react";

/**
 * Marketing-only primary CTA, in the workspace's frosted-blue treatment
 * (nova's `.cn-button-variant-default`: translucent sky tint + soft ring +
 * blur) so landing and app primaries read as the same button. Kept separate
 * from `ui/button` so the landing surface stays dependency-light.
 *
 * Label colour: the brand #00A6F4 is 2.71:1 on the 10% tint and fails AA, so
 * light mode labels in `--cta-solid` (AA-verified sky ink); dark mode's
 * `--primary` clears contrast on the dark tint by itself.
 */
const BASE =
	// Fill is the frosted tint composited OPAQUE (color-mix against --background,
	// not alpha): on the lattice paper a translucent bg-primary/10 lets the grid
	// lines print straight through the button.
	"group relative inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg font-semibold " +
	"border border-primary/30 bg-[color-mix(in_srgb,var(--primary)_10%,var(--background))] text-(--cta-solid) shadow-sm dark:text-primary " +
	"hover:border-primary/40 hover:bg-[color-mix(in_srgb,var(--primary)_16%,var(--background))] hover:shadow-md active:bg-[color-mix(in_srgb,var(--primary)_22%,var(--background))] " +
	"transition-all duration-200 motion-reduce:transition-none " +
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
			// Default type before the spread: a CTA inside a form must not submit
			// it unless the caller explicitly opts in.
			<button ref={ref} type="button" className={cls} {...buttonProps}>
				{inner}
			</button>
		);
	}
);

CtaButton.displayName = "CtaButton";

export { CtaButton };
