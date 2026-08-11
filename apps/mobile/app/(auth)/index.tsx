import { AuthView } from "@clerk/expo/native";
import { View } from "react-native";
import { AuthScreenShell } from "@/components/auth/AuthScreenShell";
import { useDevice } from "@/lib/use-device";

// Themed AuthView host. Routing after auth is the layout's job: (auth)/_layout
// reacts to the verified session and <Redirect>s — this host owns no callback.
// mode="signIn": the app is SIGN-IN ONLY (Apple 3.1.1) — no in-app account or
// organization registration. Account sign-up and business setup live in the web
// app; this screen only authenticates users who already have an account.
export default function AuthScreen() {
	const { device } = useDevice();
	const isPad = device === "ipad";
	return (
		<AuthScreenShell>
			{/* AuthView has no style prop and no intrinsic height — it fills its
			    parent, so the host must resolve to a real height. Both branches
			    now sit inside content-sized cards (3.0 glass card / iPad panel),
			    where a flex:1 child collapses to 0 — hence fixed minHeights. */}
			<View style={isPad ? { minHeight: 480 } : { minHeight: 440 }}>
				<AuthView mode="signIn" isDismissible={false} />
			</View>
		</AuthScreenShell>
	);
}
