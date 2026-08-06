"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast as sonnerToast } from "sonner";
import confetti from "canvas-confetti";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { CelebrationToast } from "./celebration-toast";

// Mirrors the backend freshness window — events older than this stay bell-only.
const FRESHNESS_MS = 15 * 60 * 1000;
const TOAST_DURATION_MS = 8000;
const ACK_RETRY_DELAY_MS = 4000;
const ACK_MAX_ATTEMPTS = 3;

/**
 * Resolve theme tokens to hex. canvas-confetti parses colors with a hex-only
 * regex, so oklch()/rgb() token values must be normalized first — a canvas
 * fillStyle round-trip serializes any opaque CSS color to #rrggbb.
 */
function tokenColors(): string[] | undefined {
	const styles = getComputedStyle(document.documentElement);
	const ctx = document.createElement("canvas").getContext("2d");
	if (!ctx) return undefined;
	const colors: string[] = [];
	for (const name of ["--success", "--primary", "--chart-2", "--chart-4"]) {
		const value = styles.getPropertyValue(name).trim();
		if (!value) continue;
		ctx.fillStyle = "#000";
		ctx.fillStyle = value;
		const normalized = ctx.fillStyle;
		if (typeof normalized === "string" && normalized.startsWith("#")) {
			colors.push(normalized);
		}
	}
	return colors.length > 0 ? colors : undefined;
}

/** Double burst from the toast's bottom-center position. */
function fireConfetti(): number {
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
	return window.setTimeout(() => {
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
	const burstTimer = useRef<number | undefined>(undefined);
	const ackTimer = useRef<number | undefined>(undefined);

	useEffect(
		() => () => {
			window.clearTimeout(burstTimer.current);
			window.clearTimeout(ackTimer.current);
		},
		[]
	);

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
		burstTimer.current = fireConfetti();

		// Stamp celebratedAt so the toast never re-fires after a reload; retry a
		// few times on transient failure before falling back to processedIds.
		const ack = (ids: Id<"notifications">[], attempt: number) => {
			void markCelebrated({ ids }).catch(() => {
				if (attempt < ACK_MAX_ATTEMPTS) {
					ackTimer.current = window.setTimeout(
						() => ack(ids, attempt + 1),
						ACK_RETRY_DELAY_MS * attempt
					);
				}
			});
		};
		ack(
			fresh.map((row) => row._id),
			1
		);
	}, [rows, markCelebrated]);

	return null;
}
