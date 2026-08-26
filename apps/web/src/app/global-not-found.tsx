import "./globals.css";
import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { ThemeProvider } from "@/providers/ThemeProvider";
import NotFoundView from "@/components/shared/not-found-view";

const outfit = Outfit({
	variable: "--font-outfit",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "Page not found | OneTool",
	description: "The page you are looking for does not exist.",
};

// global-not-found renders outside the root layout, so it owns its own
// <html>/<body> and must re-apply the font + theme wiring itself.
export default function GlobalNotFound() {
	return (
		<html suppressHydrationWarning lang="en">
			<body className={`${outfit.className} style-nova antialiased`}>
				<ThemeProvider>
					<NotFoundView />
				</ThemeProvider>
			</body>
		</html>
	);
}
