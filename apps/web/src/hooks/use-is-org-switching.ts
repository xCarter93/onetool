"use client";

import { useAuth } from "@clerk/nextjs";
import { useConvexAuth } from "convex/react";
import { useEffect, useState } from "react";

// Short bridges only — once Convex's own auth-loading signal flips, that
// drives the skeleton. Longer values force loading state to outlive the
// real handshake and make switches feel slow.
const SWITCH_GRACE_MS = 400;
const EXPLICIT_SWITCH_GRACE_MS = 800;

// Shared at module scope so hook instances mounted AFTER the switch (e.g.
// because Clerk navigated to a new route and remounted the page) can still
// see the in-flight switch — a per-instance ref would reset on the remount.
let lastSeenOrgId: string | null | undefined = undefined;
let switchExpiresAt = 0;
let expirationTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
	for (const fn of listeners) fn();
}

function openGraceWindow(durationMs: number): void {
	const newExpiresAt = Date.now() + durationMs;
	if (newExpiresAt <= switchExpiresAt) return;
	switchExpiresAt = newExpiresAt;
	if (expirationTimer) clearTimeout(expirationTimer);
	expirationTimer = setTimeout(() => {
		expirationTimer = null;
		notify();
	}, durationMs);
	queueMicrotask(notify);
}

function observe(current: string | null): void {
	if (lastSeenOrgId === undefined) {
		lastSeenOrgId = current;
		return;
	}
	if (lastSeenOrgId === current) return;

	lastSeenOrgId = current;
	openGraceWindow(SWITCH_GRACE_MS);
}

/**
 * Open the grace window synchronously before Clerk's auth state propagates.
 * Call this from the org switcher click handler — useAuth().orgId only
 * updates after Clerk's session API responds, which can be hundreds of ms
 * after the click, so observe() alone leaves a stale-data flash.
 */
export function markOrgSwitching(): void {
	openGraceWindow(EXPLICIT_SWITCH_GRACE_MS);
}

/**
 * Returns true while the active org is in flight: either Clerk just changed
 * orgId (we hold a grace window so the post-switch render shows skeletons),
 * or Convex is mid-handshake on a new auth token (catches the case where
 * Convex re-validates before Clerk's React state propagates).
 */
export function useIsOrgSwitching(): boolean {
	const { orgId, isLoaded } = useAuth();
	const { isLoading: isConvexAuthLoading } = useConvexAuth();
	const [, forceRender] = useState(0);

	// Observing during render is intentional: hooks freshly mounted from a
	// post-switch remount need to see the in-flight window on their FIRST
	// render. `observe` is idempotent on re-entry.
	if (isLoaded) observe(orgId ?? null);

	useEffect(() => {
		const listener = () => forceRender((n) => n + 1);
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	}, []);

	const inGracePeriod = isLoaded && Date.now() < switchExpiresAt;
	return inGracePeriod || isConvexAuthLoading;
}
