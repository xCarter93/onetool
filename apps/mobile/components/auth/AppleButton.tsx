import { useSignInWithApple } from "@clerk/expo/apple";
import * as AppleAuthentication from "expo-apple-authentication";
import { View } from "react-native";
import { radii } from "@/lib/theme";
import { isCancellation, mapAuthError } from "@/lib/authErrors";

interface AppleButtonProps {
	type: "SIGN_IN" | "SIGN_UP";
	disabled?: boolean;
	onError: (message: string) => void;
	onSuccess: () => void;
}

// Native Sign in with Apple via Clerk's useSignInWithApple — token exchange,
// nonce, and ERR_REQUEST_CANCELED handling all live inside the hook (AUTH-01).
// AppleAuthenticationButton props extend ViewProps (NOT Pressable) and have NO
// real `disabled` prop, so disabling is a guarded onPress + an opacity wrapper.
export function AppleButton({
	type,
	disabled = false,
	onError,
	onSuccess,
}: AppleButtonProps) {
	const { startAppleAuthenticationFlow } = useSignInWithApple();

	const onPress = async () => {
		if (disabled) return; // the native button has no disabled prop — guard here
		try {
			// Apple fullName is discarded by useSignInWithApple (identityToken-only);
			// name capture deferred post-v2.0.
			const { createdSessionId, setActive } =
				await startAppleAuthenticationFlow();
			if (createdSessionId && setActive) {
				await setActive({ session: createdSessionId });
				onSuccess();
			}
			// createdSessionId === null is a silent cancel — render nothing.
		} catch (err) {
			if (isCancellation(err)) return; // silent (Apple-native cancel)
			onError(mapAuthError(err).message);
		}
	};

	return (
		<View
			style={{ opacity: disabled ? 0.5 : 1 }}
			pointerEvents={disabled ? "none" : "auto"}
		>
			<AppleAuthentication.AppleAuthenticationButton
				buttonType={AppleAuthentication.AppleAuthenticationButtonType[type]}
				buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
				cornerRadius={radii.lg}
				style={{ height: 48, width: "100%" }}
				onPress={onPress}
			/>
		</View>
	);
}
