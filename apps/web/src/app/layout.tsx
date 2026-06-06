import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { ThemeProvider } from "@/providers/ThemeProvider";
import { ToastProvider } from "@/hooks/use-toast";
import "./globals.css";
// Portal-only font assets (Caveat for typed-signature canvas rendering).
// Next.js 16 requires global CSS imports at the root layout. See Plan 14-03.
import "@/styles/portal-fonts.css";

const outfit = Outfit({
	variable: "--font-outfit",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "OneTool",
	description: "All-in-one business management platform for modern teams",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html suppressHydrationWarning lang="en">
			<body className={`${outfit.className} antialiased`}>
				<ThemeProvider>
					<ToastProvider position="top-right" maxToasts={5}>
						{children}
					</ToastProvider>
				</ThemeProvider>
			</body>
		</html>
	);
}
