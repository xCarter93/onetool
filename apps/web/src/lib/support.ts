import posthog from "posthog-js";

/**
 * PostHog Support (conversations) wrappers. The conversations module loads
 * async from remote config, so every call is null-guarded — the SDK returns
 * null/no-ops until available.
 */

/**
 * Server-verified ticket ownership (hash from api.support.getConversationsIdentity).
 * Survives posthog.reset() on sign-out and works cross-device.
 */
export function setSupportIdentity(distinctId: string, hash: string) {
	posthog.setIdentity(distinctId, hash);
}

export function clearSupportIdentity() {
	posthog.clearIdentity();
}

export function isSupportAvailable(): boolean {
	return posthog.conversations?.isAvailable() ?? false;
}

/** Open the widget (thread/reply view). */
export function showSupportWidget() {
	posthog.conversations?.show();
}

/**
 * Create a new ticket. Resolves null when conversations are unavailable
 * (ad blocker, disabled project, remote config not loaded) or the send fails.
 */
export async function sendSupportMessage(
	message: string,
	traits: { name?: string; email?: string }
): Promise<boolean> {
	try {
		const response = await posthog.conversations?.sendMessage(
			message,
			traits,
			true
		);
		return response != null;
	} catch {
		return false;
	}
}

/**
 * Suppress the default floating launcher: OneTool's entry points are the
 * HelpMenu rows, not a chat bubble. The conversations module arrives async
 * from remote config, so poll until available, then hide. Returns cleanup.
 */
export function suppressSupportLauncher(): () => void {
	const POLL_MS = 500;
	const GIVE_UP_MS = 30_000;
	const interval = window.setInterval(() => {
		if (posthog.conversations?.isAvailable()) {
			posthog.conversations.hide();
			window.clearInterval(interval);
			window.clearTimeout(timeout);
		}
	}, POLL_MS);
	const timeout = window.setTimeout(
		() => window.clearInterval(interval),
		GIVE_UP_MS
	);
	return () => {
		window.clearInterval(interval);
		window.clearTimeout(timeout);
	};
}
