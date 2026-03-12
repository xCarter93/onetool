"use client";

import { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { useTheme } from "next-themes";
import { env } from "@/env";

const getSharedElements = (isDark: boolean) => ({
	logoImage: {
		width: "200px",
		height: "auto",
		...(isDark && { filter: "brightness(0) invert(1)" }),
	},
	formButtonPrimary:
		"bg-primary/10 hover:bg-primary/15 text-primary hover:text-primary/80 ring-1 ring-primary/30 hover:ring-primary/40 shadow-sm hover:shadow-md backdrop-blur-sm transition-all duration-200",
	card: "shadow-xl backdrop-blur-sm",
	headerTitle: "text-foreground",
	headerSubtitle: "text-muted-foreground",
	socialButtonsBlockButton:
		"border-border hover:bg-accent hover:text-accent-foreground",
	formFieldLabel: "text-foreground",
	formFieldInput: "border-border focus:border-primary focus:ring-primary",
	footerActionLink: "text-primary hover:text-primary/90",
});

export function ClerkProviderWithTheme({
	children,
}: {
	children: ReactNode;
}) {
	const { resolvedTheme } = useTheme();
	const isDark = resolvedTheme === "dark";
	const elements = getSharedElements(isDark);

	return (
		<ClerkProvider
			publishableKey={env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
			afterSignOutUrl="/"
			appearance={{
				baseTheme: isDark ? dark : undefined,
				elements: {
					logoImage: elements.logoImage,
				},
				signIn: { elements },
				signUp: { elements },
			}}
		>
			{children}
		</ClerkProvider>
	);
}
