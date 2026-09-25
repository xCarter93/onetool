"use client";

import { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/ui/themes";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { env } from "@/env";
import { clerkBrandVariables } from "@/lib/clerk-appearance";

const getSharedElements = (isDark: boolean, isMarketing: boolean) => ({
	logoImage: {
		width: "200px",
		height: "auto",
		...(isDark && { filter: "brightness(0) invert(1)" }),
	},
	formButtonPrimary: isMarketing
		? "bg-primary/10 hover:bg-primary/15 text-primary hover:text-primary/80 ring-1 ring-primary/30 hover:ring-primary/40 shadow-sm hover:shadow-md backdrop-blur-sm transition-all duration-200"
		: "h-7 rounded bg-primary text-primary-foreground hover:bg-primary/90 shadow-none",
	card: isMarketing
		? "shadow-xl backdrop-blur-sm"
		: "rounded-lg border border-border bg-card shadow-none",
	headerTitle: "text-foreground",
	headerSubtitle: "text-muted-foreground",
	formFieldLabel: "text-foreground",
	formFieldInput: isMarketing
		? "border-border focus:border-primary focus:ring-primary"
		: "h-7 rounded border-border bg-background focus:border-primary focus:ring-primary",
	footerActionLink: "text-primary hover:text-primary/90",
});

export function ClerkProviderWithTheme({
	children,
}: {
	children: ReactNode;
}) {
	const { resolvedTheme } = useTheme();
	const isMarketing = usePathname() === "/";
	const isDark = resolvedTheme === "dark";
	const elements = getSharedElements(isDark, isMarketing);

	return (
		<ClerkProvider
			publishableKey={env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
			afterSignOutUrl="/"
			appearance={{
				cssLayerName: "clerk",
				theme: isDark ? dark : undefined,
				...(!isMarketing && { variables: clerkBrandVariables }),
				elements: {
					logoImage: elements.logoImage,
				},
				signIn: { elements },
				signUp: { elements },
				...(!isMarketing && {
					userProfile: { elements },
					organizationProfile: { elements },
				}),
			}}
		>
			{children}
		</ClerkProvider>
	);
}
