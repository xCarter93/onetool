"use client";

import React, { useCallback, useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { loadConnectAndInitialize } from "@stripe/connect-js";
import type { StripeConnectInstance } from "@stripe/connect-js";
import { useTheme } from "@/providers/ThemeProvider";
import { env } from "@/env";

export interface StripeConnectSession {
	connectInstance: StripeConnectInstance | null;
	/** Last Account Session request failure; components stay blank until retried. */
	error: string | null;
	retry: () => void;
}

interface StripeConnectProviderProps {
	accountId: string;
	children: (session: StripeConnectSession) => React.ReactNode;
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
 * Owns one Connect.js instance per connected account. Connect.js calls
 * `fetchClientSecret` lazily and again whenever a session expires, so every
 * call must mint a fresh Account Session — never cache the secret.
 */
export function StripeConnectProvider({
	accountId,
	children,
}: StripeConnectProviderProps) {
	const [connectInstance, setConnectInstance] =
		useState<StripeConnectInstance | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [generation, setGeneration] = useState(0);
	const { resolvedTheme } = useTheme();
	const { isSignedIn } = useAuth();

	const retry = useCallback(() => setGeneration((n) => n + 1), []);

	useEffect(() => {
		let cancelled = false;
		// Deferred so the effect doesn't set state synchronously.
		queueMicrotask(() => {
			if (cancelled) return;
			setError(null);
			if (!accountId) {
				setConnectInstance(null);
				return;
			}
			// Match the app theme at init to avoid a restyle flash; the effect
			// below keeps it in sync with later theme switches.
			const isDark = document.documentElement.classList.contains("dark");
			setConnectInstance(
				loadConnectAndInitialize({
					publishableKey: env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
					fetchClientSecret: async () => {
						// The route derives the account from the caller's own org
						// server-side — never send a client-supplied accountId.
						let message = "Couldn't connect to Stripe.";
						try {
							const response = await fetch(
								"/api/stripe-connect/account-session",
								{ method: "POST" },
							);
							const data = await response.json();
							if (response.ok && typeof data.clientSecret === "string") {
								if (!cancelled) setError(null);
								return data.clientSecret;
							}
							// Bare codes (NOT_ORG_OWNER, UNAUTHORIZED) aren't user copy.
							if (
								typeof data?.error === "string" &&
								!/^[A-Z_]+$/.test(data.error)
							) {
								message = data.error;
							}
						} catch {
							// Network failure: keep the generic message.
						}
						if (!cancelled) setError(message);
						throw new Error(message);
					},
					fonts: [{ cssSrc: OUTFIT_CSS_SRC }],
					appearance: {
						overlays: "drawer",
						variables: appearanceVariables(isDark),
					},
				}),
			);
		});
		// No logout here: Stripe reserves it for app sign-out, and the old
		// instance is simply dropped when the account changes.
		return () => {
			cancelled = true;
		};
	}, [accountId, generation]);

	// Stripe: call logout when the user signs out of the app so the embedded
	// components' session cookies are cleared with it.
	useEffect(() => {
		if (isSignedIn === false && connectInstance) {
			void connectInstance.logout();
		}
	}, [isSignedIn, connectInstance]);

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

	return <>{children({ connectInstance, error, retry })}</>;
}
