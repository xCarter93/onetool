import { Redirect } from "expo-router";
import { useAuth } from "@clerk/expo";
import { View, ActivityIndicator } from "react-native";
import type { Href } from "expo-router";

export default function Index() {
	const { isSignedIn, isLoaded } = useAuth();

	// Show loading state while checking auth
	if (!isLoaded) {
		return (
			<View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
				<ActivityIndicator size="large" />
			</View>
		);
	}

	// Redirect based on authentication status
	if (isSignedIn) {
		return <Redirect href="/(tabs)" />;
	}

	return <Redirect href={"/(auth)/sign-in" as Href} />;
}
