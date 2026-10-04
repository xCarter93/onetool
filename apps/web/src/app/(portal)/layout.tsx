import "@/app/globals.css";
import "@/app/app-theme.css";
import "@/styles/portal-fonts.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import ConvexPortalProvider from "@/providers/ConvexPortalProvider";
import { ToastProvider } from "@/hooks/use-toast";

export const metadata: Metadata = {
	title: "Client Portal",
	robots: { index: false, follow: false },
};

// No <html>/<body> here: the root layout owns the document; a second one broke hydration.
export default function PortalLayout({ children }: { children: ReactNode }) {
	return (
		<ToastProvider position="top-right" maxToasts={3}>
			<ConvexPortalProvider>{children}</ConvexPortalProvider>
		</ToastProvider>
	);
}
