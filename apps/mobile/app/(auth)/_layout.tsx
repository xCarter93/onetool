import { Redirect, Stack } from "expo-router";
import { useAuth } from "@clerk/expo";

export default function AuthRoutesLayout() {
	const { isSignedIn } = useAuth();

	// If the user is already signed in, redirect them to the home page
	if (isSignedIn) {
		return <Redirect href="/(tabs)" />;
	}

	return <Stack screenOptions={{ headerShown: false }} />;
}

