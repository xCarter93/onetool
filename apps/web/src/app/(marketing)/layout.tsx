import type { ReactNode } from "react";
import { ClerkProviderWithTheme } from "@/providers/ClerkProviderWithTheme";

/**
 * (marketing) route group layout — owns ClerkProviderWithTheme so the public
 * landing page can render Clerk's <SignedIn>/<SignedOut> components in the
 * navbar and pricing section. Workspace routes have their own layout with
 * their own provider; portal routes (Plan 13-06) get NO Clerk provider — that
 * is the whole point of moving Clerk out of the global root [Review fix #1].
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
	return <ClerkProviderWithTheme>{children}</ClerkProviderWithTheme>;
}
