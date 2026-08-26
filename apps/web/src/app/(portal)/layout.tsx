import type { Metadata } from "next";
import type { ReactNode } from "react";
import ConvexPortalProvider from "@/providers/ConvexPortalProvider";

export const metadata: Metadata = {
	title: "Client Portal",
	robots: { index: false, follow: false },
};

// Route groups nest inside the root layout, so this must NOT render its own
// <html>/<body> — fonts, theme, and toasts already come from the root layout.
// Rendering a second <html> here caused nested-document hydration errors on
// every portal page.
export default function PortalLayout({ children }: { children: ReactNode }) {
	return <ConvexPortalProvider>{children}</ConvexPortalProvider>;
}
