import type { ReactNode } from "react";
import { ClerkProviderWithTheme } from "@/providers/ClerkProviderWithTheme";
import { BlueprintDefs } from "@/app/components/landing/blueprint/blueprint-defs";
import { BlueprintMotionProvider } from "@/app/components/landing/blueprint/blueprint-motion-provider";

/**
 * (marketing) route group layout — owns ClerkProviderWithTheme so the public
 * landing page can render Clerk's <SignedIn>/<SignedOut> components in the
 * navbar and pricing section. Workspace routes have their own layout with
 * their own provider; portal routes (Plan 13-06) get NO Clerk provider — that
 * is the whole point of moving Clerk out of the global root [Review fix #1].
 *
 * Also the single mount point for the blueprint drafting language:
 *  - <BlueprintDefs/> is the ONE SVG sprite (hatch patterns, arrow marker).
 *    SVG fragment ids are document-global, so a second mount anywhere brings
 *    back the duplicate-id bug where consumers silently lose their fills.
 *  - <BlueprintMotionProvider> is LazyMotion(domAnimation, strict) — the
 *    marketing surface ships the ~15KB feature bundle and any stray `motion.*`
 *    (rather than `<m.*>`) throws.
 *
 * `children` remains a server subtree through both wrappers.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
	return (
		<ClerkProviderWithTheme>
			<BlueprintDefs />
			<BlueprintMotionProvider>{children}</BlueprintMotionProvider>
		</ClerkProviderWithTheme>
	);
}
