import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClerkProviderWithTheme } from "@/providers/ClerkProviderWithTheme";
import "@/app/components/marketing/landing.css";

/**
 * (marketing) route group layout — owns ClerkProviderWithTheme so the public
 * landing page can render Clerk's <SignedIn>/<SignedOut> components in the
 * navbar and pricing section. Workspace routes have their own layout with
 * their own provider; portal routes get NO Clerk provider on purpose.
 *
 * The redesigned landing animates with CSS only (landing.css), so the old
 * blueprint SVG-defs mount and LazyMotion provider are gone with it.
 */
export const metadata: Metadata = {
	title: "OneTool — Quote it. Get it signed. Get paid.",
	description:
		"Business management for HVAC, landscaping, cleaning and trades. Clients, quotes, e-signatures, scheduling, routing, invoices and card payments — the whole job in one place, run from a phone in a truck.",
};

export default function MarketingLayout({ children }: { children: ReactNode }) {
	return <ClerkProviderWithTheme>{children}</ClerkProviderWithTheme>;
}
