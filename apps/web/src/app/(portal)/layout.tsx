import type { ReactNode } from "react";
import { Outfit } from "next/font/google";
import "@/app/globals.css";
import ConvexPortalProvider from "@/providers/ConvexPortalProvider";
import { ThemeProvider } from "@/providers/ThemeProvider";
import { ToastProvider } from "@/hooks/use-toast";

const outfit = Outfit({
	subsets: ["latin"],
	weight: ["400", "600"],
	variable: "--font-outfit",
});

export const metadata = {
	title: "Client Portal",
	robots: { index: false, follow: false },
};

export default function PortalRootLayout({
	children,
}: {
	children: ReactNode;
}) {
	return (
		<html lang="en" suppressHydrationWarning className={outfit.variable}>
			<body className="antialiased">
				<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
					<ToastProvider position="top-right" maxToasts={5}>
						<ConvexPortalProvider>{children}</ConvexPortalProvider>
					</ToastProvider>
				</ThemeProvider>
			</body>
		</html>
	);
}
