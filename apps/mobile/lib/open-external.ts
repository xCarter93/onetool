import { Alert, Linking } from "react-native";

/**
 * Open a tel:/sms:/mailto:/maps URL with a graceful fallback. Linking.openURL
 * rejects when no app handles the scheme (simulators lack Phone and Mail
 * entirely; real devices can have Mail unconfigured) — an uncaught rejection
 * surfaces as a dev error toast, so every external open routes through here.
 */
export function openExternal(url: string, appLabel: string) {
	Linking.openURL(url).catch(() => {
		Alert.alert(
			`Couldn't open ${appLabel}`,
			`This device doesn't have an app set up for ${appLabel.toLowerCase()}.`,
			[{ text: "OK" }]
		);
	});
}
