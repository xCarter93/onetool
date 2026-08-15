"use client";

import type { ReactNode } from "react";
import UserCursor from "@/components/react-bits/user-cursor";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "./use-reduced-motion";

/* The Try-it simulation hands the visitor somebody else's pointer: inside the
 * surface the OS cursor is replaced by a named collaborator cursor, and who you
 * are standing in for changes as the job moves through the loop. Direction-aware
 * tilt is deliberately off — a real pointer does not swivel, and the personality
 * belongs to the label, which trails on its own softer spring.
 *
 * Reduced motion and coarse pointers get the plain OS cursor: the ghost never
 * mounts, so the `lp-sim-cursor` rule that hides the native one never applies
 * either. */

export type Identity = {
	name: string;
	/** A landing token, not a hex — the label pill and arrow both take it. */
	color: string;
};

/** Tight enough to sit under the pointer on a control, not so stiff it reads
 *  as a plain cursor swap. */
const ARROW_SPRING = { stiffness: 900, damping: 48, mass: 0.4 };
const LABEL_SPRING = { stiffness: 260, damping: 30, mass: 0.7 };

export function SimCursor({
	identity,
	className,
	children,
}: {
	identity: Identity;
	className?: string;
	children: ReactNode;
}) {
	const reduced = usePrefersReducedMotion();

	if (reduced) return <div className={className}>{children}</div>;

	return (
		<UserCursor
			className={cn("lp-sim-cursor", className)}
			name={identity.name}
			color={identity.color}
			textColor="var(--paper)"
			size={26}
			trigger="hover"
			showLabel
			hideOnTouch
			spring={ARROW_SPRING}
			labelSpring={LABEL_SPRING}
			zIndex={40}
		>
			{children}
		</UserCursor>
	);
}
