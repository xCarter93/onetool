import { AuthView } from "@clerk/expo/native";
import { View } from "react-native";
import { AuthScreenShell } from "@/components/auth/AuthScreenShell";

// Themed AuthView host. Routing after auth is the layout's job: (auth)/_layout
// reacts to the verified session and <Redirect>s — this host owns no callback.
export default function AuthScreen() {
	return (
		<AuthScreenShell
			title="Welcome to OneTool"
			subtitle="Sign in or create your account"
		>
			{/* flex:1 wrapper so AuthView (fills its parent) gets a real height on
			    iPhone and inside the constrained iPad floating card. */}
			<View style={{ flex: 1 }}>
				<AuthView mode="signInOrUp" isDismissible={false} />
			</View>
		</AuthScreenShell>
	);
}
