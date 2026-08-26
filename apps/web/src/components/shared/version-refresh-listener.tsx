"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { toast as sonnerToast } from "sonner";
import { RefreshCw, X } from "lucide-react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Button } from "@/components/ui/button";

// Vercel system vars, inlined at build time. NEXT_PUBLIC_VERCEL_URL is this
// deployment's unique generated domain — the same value the deploy webhook
// stores in Convex. Absent in local dev; preview deploys bake a URL that never
// matches production, so both cases disable the check entirely.
const BUILD_DEPLOYMENT_URL = process.env.NEXT_PUBLIC_VERCEL_URL;
const IS_PRODUCTION_BUILD = process.env.NEXT_PUBLIC_VERCEL_ENV === "production";

const TOAST_ID = "version-refresh";

function VersionToast({ onDismiss }: { onDismiss: () => void }) {
	return (
		<div
			role="status"
			className="pointer-events-auto flex w-full items-start gap-3 rounded-lg border border-border bg-popover p-4 shadow-lg sm:w-[356px]"
		>
			<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
				<RefreshCw className="h-4 w-4" aria-hidden />
			</div>
			<div className="min-w-0 flex-1">
				<p className="text-sm font-semibold text-foreground">
					OneTool has been updated
				</p>
				<p className="mt-0.5 text-sm text-muted-foreground">
					Refresh to load the latest version.
				</p>
				<Button
					size="sm"
					className="mt-2.5"
					onClick={() => window.location.reload()}
				>
					Refresh
				</Button>
			</div>
			<button
				type="button"
				onClick={onDismiss}
				aria-label="Dismiss"
				className="shrink-0 rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
			>
				<X className="h-4 w-4" aria-hidden />
			</button>
		</div>
	);
}

/**
 * Watches the live production deployment recorded in Convex (written by the
 * Vercel deploy webhook) and shows a persistent refresh toast when this tab
 * is on an older deployment. Renders nothing.
 */
export function VersionRefreshListener() {
	const enabled = IS_PRODUCTION_BUILD && !!BUILD_DEPLOYMENT_URL;
	const live = useQuery(api.appVersion.get, enabled ? {} : "skip");
	const shownFor = useRef<string | null>(null);

	useEffect(() => {
		if (!enabled || !live?.deploymentUrl) return;
		if (
			live.deploymentUrl === BUILD_DEPLOYMENT_URL ||
			live.deploymentUrl === shownFor.current
		)
			return;
		shownFor.current = live.deploymentUrl;
		sonnerToast.custom(
			() => <VersionToast onDismiss={() => sonnerToast.dismiss(TOAST_ID)} />,
			{ id: TOAST_ID, duration: Infinity, position: "bottom-right" }
		);
	}, [enabled, live]);

	return null;
}
