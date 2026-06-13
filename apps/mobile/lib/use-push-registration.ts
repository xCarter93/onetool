import { useCallback } from "react";
import { useAuth } from "@clerk/expo";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";

// EAS projectId literal (app.json extra.eas.projectId) — required by
// getExpoPushTokenAsync; passed directly to avoid an expo-constants dep.
const EAS_PROJECT_ID = "6984c14f-84fc-4379-9c29-d55c1adb2801";

// Cold-start cache so an explicit enable (or re-render) never re-fires
// getExpoPushTokenAsync twice per launch. Reset implicitly per process.
let cachedToken: string | null = null;

export interface PushPermissionStatus {
	status: Notifications.PermissionStatus;
	canAskAgain: boolean;
}

export function usePushRegistration(): {
	getPushPermissionStatus: () => Promise<PushPermissionStatus>;
	enablePushNotifications: () => Promise<string | null>;
} {
	// Durable Clerk identity — the registration is user-scoped, never org-scoped,
	// so it survives the ConvexClerkProvider org-switch remount.
	const { userId } = useAuth();

	// SILENT: never triggers the one-shot iOS prompt — only reads current state so
	// the pre-prompt/affordance can decide whether to show.
	const getPushPermissionStatus =
		useCallback(async (): Promise<PushPermissionStatus> => {
			const { status, canAskAgain } =
				await Notifications.getPermissionsAsync();
			return { status, canAskAgain };
		}, []);

	// EXPLICIT: the ONLY caller of requestPermissionsAsync. Wired to the Enable
	// button so the soft pre-prompt never silently fires the system prompt.
	const enablePushNotifications =
		useCallback(async (): Promise<string | null> => {
			if (!Device.isDevice) return null; // simulator / Expo Go cannot receive push
			if (!userId) return null;

			const { status } = await Notifications.requestPermissionsAsync();
			if (status !== "granted") return null;

			if (cachedToken) return cachedToken;
			const token = await Notifications.getExpoPushTokenAsync({
				projectId: EAS_PROJECT_ID,
			});
			cachedToken = token.data;
			return cachedToken; // "ExponentPushToken[...]"
		}, [userId]);

	return { getPushPermissionStatus, enablePushNotifications };
}
