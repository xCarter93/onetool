import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	type PropsWithChildren,
} from "react";
import { router, type Href } from "expo-router";
import { useAuth, useOrganization, useOrganizationList } from "@clerk/expo";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { normalizeActionUrl } from "@/lib/push-deeplink";
import { usePushRegistration } from "@/lib/use-push-registration";
import { PushPrePrompt } from "@/components/push/PushPrePrompt";

// PUSH-05: foreground display policy. Set ONCE at module load — never inside a
// component (would re-register on every render). Uses the SDK 53+ banner/list
// keys (the legacy single-alert key is deprecated).
Notifications.setNotificationHandler({
	handleNotification: async () => ({
		shouldShowBanner: true,
		shouldShowList: true,
		shouldPlaySound: true,
		shouldSetBadge: true,
	}),
});

// First-entry soft pre-prompt gate (reaches existing-org users routed straight to
// /(tabs), who never see onboarding). One non-sensitive flag.
const PREPROMPT_ASKED_KEY = "push_preprompt_asked";

type MarkReadFn = (args: { id: Id<"notifications"> }) => Promise<unknown>;

interface PendingTap {
	url?: string;
	notificationId?: Id<"notifications">;
	orgId?: string;
}

// Bridge between the host (above the Convex remount boundary) and the thin inner
// Convex child (below it). The inner child publishes markRead UP and reads the
// acquired token DOWN. markRead lives below Convex but the tap handler that needs
// it lives above — this context is the only seam crossing the boundary.
interface PushBridge {
	registerMarkRead: (fn: MarkReadFn) => void;
	pushToken: string | null;
}

const PushBridgeContext = createContext<PushBridge | null>(null);

export function usePushBridge(): PushBridge {
	const ctx = useContext(PushBridgeContext);
	if (!ctx) throw new Error("usePushBridge must be used under PushRegistrationHost");
	return ctx;
}

// Mounts the tap listeners + foreground handler + cross-org setActive ABOVE the
// Convex remount boundary (mirrors LaunchHost), so an org switch never tears them
// down. The token-write / markRead / badge sync live in a separate inner child
// under ConvexClerkProvider (see _layout.tsx).
export function PushRegistrationHost({ children }: PropsWithChildren) {
	const { userId, isLoaded } = useAuth();
	const { organization } = useOrganization();
	const { setActive } = useOrganizationList();
	const { getPushPermissionStatus, enablePushNotifications } =
		usePushRegistration();

	// markRead is published up by the inner Convex child; held in a ref so the tap
	// effect reads the latest after an org-switch remount re-publishes it.
	const markReadRef = useRef<MarkReadFn | null>(null);
	const [markReadReady, setMarkReadReady] = useState(false);
	const registerMarkRead = useCallback((fn: MarkReadFn) => {
		markReadRef.current = fn;
		setMarkReadReady(true);
	}, []);

	const [pushToken, setPushToken] = useState<string | null>(null);
	const [pendingTap, setPendingTap] = useState<PendingTap | null>(null);
	const [showPrePrompt, setShowPrePrompt] = useState(false);

	const activeOrgId = organization?.id;

	const enqueueTap = useCallback((notification: Notifications.Notification) => {
		const data = notification.request.content.data as PendingTap | undefined;
		setPendingTap({
			url: data?.url,
			notificationId: data?.notificationId,
			orgId: data?.orgId,
		});
	}, []);

	// Tap listeners: foreground responses + the cold-start tap that launched the
	// app from killed state. Both QUEUE into pendingTap — never navigate/markRead
	// immediately (the inner child / setActive may not be ready yet).
	useEffect(() => {
		// Defer the cold-start read out of the synchronous effect body (the listener
		// callback below is an external-event source, exempt).
		const last = Notifications.getLastNotificationResponse();
		if (last?.notification) {
			const n = last.notification;
			queueMicrotask(() => enqueueTap(n));
		}

		const sub = Notifications.addNotificationResponseReceivedListener((r) =>
			enqueueTap(r.notification),
		);
		return () => sub.remove();
	}, [enqueueTap]);

	// processTap: fires only when EVERYTHING is ready — auth loaded, markRead
	// published, router mounted (router is import-stable). On a cross-org tap it
	// setActive(data.orgId) FIRST and returns; the Convex remount re-publishes a
	// fresh markRead and re-runs this effect once activeOrgId matches, then it
	// navigates + marks read.
	useEffect(() => {
		if (!pendingTap) return;
		if (!isLoaded || !userId) return;
		if (!markReadReady || !markReadRef.current) return;

		let cancelled = false;
		let didSwitchOrg = false;
		const run = async () => {
			try {
				// Cross-org: switch into the originating org before resolving the
				// entity view + markRead (both are active-org scoped).
				if (pendingTap.orgId && pendingTap.orgId !== activeOrgId) {
					if (setActive) {
						await setActive({ organization: pendingTap.orgId });
						didSwitchOrg = true; // keep pendingTap for the post-remount re-run
					}
					return; // re-run after remount publishes a fresh markRead
				}
				if (cancelled) return;

				const url = pendingTap.url;
				if (url) {
					const target = normalizeActionUrl(url);
					if (target.startsWith("/")) router.push(target as Href);
				}
				if (pendingTap.notificationId) {
					// swallow already-read / invalid-id errors (re-tap is harmless)
					await markReadRef.current?.({ id: pendingTap.notificationId });
				}
			} catch (error) {
				if (__DEV__) console.warn("push tap processing failed", error);
			} finally {
				// Do NOT clear on the cross-org path — the org switch remounts the
				// Convex child and re-runs this effect; pendingTap must survive so the
				// re-run (now same-org) can navigate + markRead.
				if (!cancelled && !didSwitchOrg) setPendingTap(null);
			}
		};
		void run();
		return () => {
			cancelled = true;
		};
	}, [pendingTap, isLoaded, userId, markReadReady, activeOrgId, setActive]);

	// First-entry soft pre-prompt: shown once per device when permission is
	// undetermined and the user has not been asked. Hosted here so it reaches
	// tabs-routed (existing-org) users, not just onboarding.
	useEffect(() => {
		if (!isLoaded || !userId) return;
		let active = true;
		(async () => {
			const asked = await AsyncStorage.getItem(PREPROMPT_ASKED_KEY);
			if (asked) return;
			const { status, canAskAgain } = await getPushPermissionStatus();
			if (!active) return;
			if (status !== "granted" && canAskAgain) setShowPrePrompt(true);
		})();
		return () => {
			active = false;
		};
	}, [isLoaded, userId, getPushPermissionStatus]);

	const dismissPrePrompt = useCallback(() => {
		setShowPrePrompt(false);
		AsyncStorage.setItem(PREPROMPT_ASKED_KEY, "1").catch((e) => {
			if (__DEV__) console.warn("preprompt flag persist failed", e);
		});
	}, []);

	const handleEnable = useCallback(async () => {
		const token = await enablePushNotifications();
		if (token) setPushToken(token); // inner child upserts it via registerToken
		dismissPrePrompt();
	}, [enablePushNotifications, dismissPrePrompt]);

	const bridge = useMemo<PushBridge>(
		() => ({ registerMarkRead, pushToken }),
		[registerMarkRead, pushToken],
	);

	return (
		<PushBridgeContext.Provider value={bridge}>
			{children}
			{showPrePrompt && (
				<PushPrePrompt onEnable={handleEnable} onDismiss={dismissPrePrompt} />
			)}
		</PushBridgeContext.Provider>
	);
}
