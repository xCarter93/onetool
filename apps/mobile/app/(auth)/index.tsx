import { AuthView } from "@clerk/expo/native";
import { View } from "react-native";
import { AuthScreenShell } from "@/components/auth/AuthScreenShell";
import { useDevice } from "@/lib/use-device";

// Themed AuthView host. Routing after auth is the layout's job: (auth)/_layout
// reacts to the verified session and <Redirect>s — this host owns no callback.
export default function AuthScreen() {
	const { device } = useDevice();
	const isPad = device === "ipad";
	return (
		<AuthScreenShell>
			{/* AuthView has no style prop and no intrinsic height — it fills its
			    parent, so the host must resolve to a real height: flex:1 in the
			    phone flex column, a fixed minHeight inside the content-sized iPad
			    card (a flex:1 child of a content-sized box collapses to 0). */}
			<View style={isPad ? { minHeight: 480 } : { flex: 1 }}>
				<AuthView mode="signInOrUp" isDismissible={false} />
			</View>
		</AuthScreenShell>
	);
}
