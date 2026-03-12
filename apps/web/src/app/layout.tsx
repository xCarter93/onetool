import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import ConvexClientProvider from "@/providers/ConvexClientProvider";
import { PostHogProvider } from "@/providers/PostHogProvider";
import { ThemeProvider } from "@/providers/ThemeProvider";
import { ClerkProviderWithTheme } from "@/providers/ClerkProviderWithTheme";
import { ToastProvider } from "@/hooks/use-toast";
import { ConfirmDialogProvider } from "@/hooks/use-confirm-dialog";
import { DynamicTitle } from "@/components/shared/dynamic-title";
import "./globals.css";

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
					<ClerkProviderWithTheme>
						<PostHogProvider>
							<ConvexClientProvider>
								<DynamicTitle />
								<ToastProvider position="top-right" maxToasts={5}>
									<ConfirmDialogProvider>{children}</ConfirmDialogProvider>
								</ToastProvider>
							</ConvexClientProvider>
						</PostHogProvider>
					</ClerkProviderWithTheme>
				</ThemeProvider>
			</body>
		</html>
	);
}
