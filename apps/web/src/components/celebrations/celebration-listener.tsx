"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast as sonnerToast } from "sonner";
import confetti from "canvas-confetti";
import { api } from "@onetool/backend/convex/_generated/api";
import { CelebrationToast } from "./celebration-toast";

// Mirrors the backend freshness window — events older than this stay bell-only.
const FRESHNESS_MS = 15 * 60 * 1000;
const TOAST_DURATION_MS = 8000;

function tokenColors(): string[] | undefined {
	const styles = getComputedStyle(document.documentElement);
	const colors = ["--success", "--primary", "--chart-2", "--chart-4"]
		.map((name) => styles.getPropertyValue(name).trim())
		.filter(Boolean);
	return colors.length > 0 ? colors : undefined;
}

/** Double burst from the toast's bottom-center position. */
function fireConfetti() {
	const colors = tokenColors();
	const base: confetti.Options = {
		origin: { x: 0.5, y: 0.98 },
		angle: 90,
		disableForReducedMotion: true,
		colors,
	};
	confetti({
		...base,
		particleCount: 90,
		spread: 65,
		startVelocity: 52,
		ticks: 180,
	});
	window.setTimeout(() => {
		confetti({
			...base,
			particleCount: 45,
			spread: 100,
			startVelocity: 38,
			scalar: 0.8,
			ticks: 150,
		});
	}, 180);
}

/**
 * Watches for fresh celebration notifications (quote approved / invoice paid,
 * from any source — workspace clicks, portal approvals, Stripe webhooks) and
 * fires the confetti toast once per notification. Renders nothing.
 */
export function CelebrationListener() {
	const rows = useQuery(api.notifications.celebrationsForCurrentUser, {});
	const markCelebrated = useMutation(api.notifications.markCelebrated);
	const processedIds = useRef(new Set<string>());

	useEffect(() => {
		if (!rows || rows.length === 0) return;
		const now = Date.now();
		const fresh = rows.filter(
			(row) =>
				!processedIds.current.has(row._id) &&
				now - row._creationTime < FRESHNESS_MS
		);
		if (fresh.length === 0) return;
		for (const row of fresh) {
			processedIds.current.add(row._id);
		}

		// Rows arrive newest-first; one toast per burst, extras coalesce.
		const [primary, ...rest] = fresh;
		const toastId = `celebration-${primary._id}`;
		const actionLabel =
			primary.notificationType === "quote_approved"
				? "View quote"
				: "View invoice";
		sonnerToast.custom(
			() => (
				<CelebrationToast
					title={primary.title}
					message={primary.message}
					flair={primary.celebrationFlair}
					actionUrl={primary.actionUrl}
					actionLabel={actionLabel}
					extraCount={rest.length}
					onDismiss={() => sonnerToast.dismiss(toastId)}
				/>
			),
			{
				id: toastId,
				duration: TOAST_DURATION_MS,
				position: "bottom-center",
			}
		);
		fireConfetti();

		void markCelebrated({ ids: fresh.map((row) => row._id) }).catch(() => {
			// Best-effort: processedIds already prevents a local re-fire.
		});
	}, [rows, markCelebrated]);

	return null;
}
