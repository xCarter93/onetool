"use client";

import { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/ui/themes";
import { useTheme } from "next-themes";
import { env } from "@/env";
import { clerkBrandVariables } from "@/lib/clerk-appearance";

const getSharedElements = (isDark: boolean) => ({
	logoImage: {
		width: "200px",
		height: "auto",
		...(isDark && { filter: "brightness(0) invert(1)" }),
	},
	formButtonPrimary: "h-7 rounded bg-primary text-primary-foreground hover:bg-primary/90 shadow-none",
	card: "rounded-lg border border-border bg-card shadow-none",
	headerTitle: "text-foreground",
	headerSubtitle: "text-muted-foreground",
	formFieldLabel: "text-foreground",
	formFieldInput: "h-7 rounded border-border bg-background focus:border-primary focus:ring-primary",
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
				cssLayerName: "clerk",
				theme: isDark ? dark : undefined,
				variables: clerkBrandVariables,
				elements: {
					logoImage: elements.logoImage,
				},
				signIn: { elements },
				signUp: { elements },
				userProfile: { elements },
				organizationProfile: { elements },
			}}
		>
			{children}
		</ClerkProvider>
	);
}
