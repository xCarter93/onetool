"use client";

import React, { useState, useEffect } from "react";
import { loadConnectAndInitialize } from "@stripe/connect-js";
import type { StripeConnectInstance } from "@stripe/connect-js";
import { useTheme } from "@/providers/ThemeProvider";
import { env } from "@/env";

interface StripeConnectProviderProps {
	accountId: string;
	children: (connectInstance: StripeConnectInstance | null) => React.ReactNode;
}

// Stripe's iframes can't reach fonts bundled by next/font, so they load
// Outfit from Google Fonts directly.
const OUTFIT_CSS_SRC =
	"https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap";

/** OneTool-flavored appearance variables for Stripe embedded components. */
function appearanceVariables(isDark: boolean) {
	return {
		fontFamily:
			'Outfit, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
		fontSizeBase: "16px",
		spacingUnit: "8px",
		borderRadius: "8px",
		// Primary color (blue from your theme)
		colorPrimary: isDark ? "#7c9eff" : "#00a6f4",
		// Background colors
		colorBackground: isDark ? "#1a1a1f" : "#ffffff",
		formBackgroundColor: isDark ? "#242429" : "#ffffff",
		offsetBackgroundColor: isDark ? "#1f1f24" : "#f9fafb",
		// Text colors
		colorText: isDark ? "#f5f5f5" : "#242424",
		colorSecondaryText: isDark ? "#b4b4b9" : "#6b7280",
		// Border colors
		colorBorder: isDark ? "#3a3a40" : "#d7d7d7",
		formHighlightColorBorder: isDark ? "#7c9eff" : "#00a6f4",
		// Danger color (red from your theme)
		colorDanger: isDark ? "#ea5a7f" : "#df2953",
		// Form accent
		formAccentColor: isDark ? "#7c9eff" : "#00a6f4",
		// Action colors
		actionPrimaryColorText: isDark ? "#7c9eff" : "#00a6f4",
		// Button styling
		buttonPrimaryColorBackground: isDark ? "#7c9eff" : "#00a6f4",
		buttonPrimaryColorBorder: isDark ? "#7c9eff" : "#00a6f4",
		buttonPrimaryColorText: "#ffffff",
		buttonSecondaryColorBackground: isDark ? "#2f2f35" : "#f3f4f6",
		buttonSecondaryColorBorder: isDark ? "#3a3a40" : "#e5e7eb",
		buttonSecondaryColorText: isDark ? "#f5f5f5" : "#1f2937",
		// Badge colors
		badgeSuccessColorBackground: isDark ? "#1a3a1f" : "#cef6bb",
		badgeSuccessColorText: isDark ? "#7ed88a" : "#05690d",
		badgeWarningColorBackground: isDark ? "#3a2f1a" : "#fceeba",
		badgeWarningColorText: isDark ? "#ffb84d" : "#a82c00",
		badgeDangerColorBackground: isDark ? "#3a1f2f" : "#f9e4f1",
		badgeDangerColorText: isDark ? "#ea5a7f" : "#b3063d",
		// Overlay
		overlayBackdropColor: isDark
			? "rgba(0, 0, 0, 0.7)"
			: "rgba(0, 0, 0, 0.5)",
	} as const;
}

/**
 * Provider component that initializes Stripe Connect and manages
 * the account session lifecycle for embedded components.
 */
export function StripeConnectProvider({
	accountId,
	children,
}: StripeConnectProviderProps) {
	const [connectInstance, setConnectInstance] =
		useState<StripeConnectInstance | null>(null);
	const { resolvedTheme } = useTheme();

	useEffect(() => {
		if (!accountId) return;

		let cancelled = false;
		const initializeConnect = async () => {
			try {
				// Fetch the account session client secret from our API. The route
				// derives the account id from the caller's own org server-side, so
				// no body is sent — never reintroduce a client-supplied accountId.
				const response = await fetch("/api/stripe-connect/account-session", {
					method: "POST",
				});

				const data = await response.json();

				if (!response.ok) {
					console.error("Account session creation failed:", data);
					throw new Error(data.error || "Failed to create account session");
				}

				const { clientSecret } = data;
				if (cancelled) return;

				// Match the app theme at init to avoid a restyle flash; the effect
				// below keeps it in sync with later theme switches.
				const isDark = document.documentElement.classList.contains("dark");

				const instance = loadConnectAndInitialize({
					publishableKey: env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
					fetchClientSecret: async () => clientSecret,
					fonts: [{ cssSrc: OUTFIT_CSS_SRC }],
					appearance: {
						overlays: "drawer",
						variables: appearanceVariables(isDark),
					},
				});

				setConnectInstance(instance);
			} catch (error) {
				console.error("Failed to initialize Stripe Connect:", error);
			}
		};

		void initializeConnect();
		return () => {
			cancelled = true;
		};
	}, [accountId]);

	// Restyle live components when the app theme changes — the instance is
	// created once, so init-time appearance alone goes stale after a toggle.
	useEffect(() => {
		if (!connectInstance || !resolvedTheme) return;
		connectInstance.update({
			appearance: {
				overlays: "drawer",
				variables: appearanceVariables(resolvedTheme === "dark"),
			},
		});
	}, [connectInstance, resolvedTheme]);

	return <>{children(connectInstance)}</>;
}
