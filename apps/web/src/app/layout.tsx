import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { ThemeProvider } from "@/providers/ThemeProvider";
import { PostHogProvider } from "@/providers/PostHogProvider";

// No CSS here: each route group's layout imports its Tailwind entry (globals.css, or (marketing)/marketing.css on the landing).
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
			<body className={`${outfit.className} style-nova antialiased`}>
				{/* Root-level so every surface (marketing, auth, portal, communities,
				    workspace) gets pageviews; AnalyticsIdentity stays in Clerk-wrapped
				    layouts since identify() needs auth context. */}
				<PostHogProvider>
					<ThemeProvider>{children}</ThemeProvider>
				</PostHogProvider>
			</body>
		</html>
	);
}
