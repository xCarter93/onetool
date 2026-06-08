import {
	ClerkProvider,
	ClerkLoaded,
	useAuth,
	useOrganization,
} from "@clerk/expo";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { useEffect, useState, type PropsWithChildren } from "react";
import { tokenCache } from "@clerk/expo/token-cache";
import { useFonts } from "expo-font";
import {
	Outfit_400Regular,
	Outfit_500Medium,
	Outfit_600SemiBold,
	Outfit_700Bold,
} from "@expo-google-fonts/outfit";
import * as SplashScreen from "expo-splash-screen";

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

// Set the animation options (optional)
SplashScreen.setOptions({
	duration: 1000,
	fade: true,
});

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!);

function ConvexClerkProvider({ children }: PropsWithChildren) {
	const { organization } = useOrganization();
	const [convexKey, setConvexKey] = useState(0);

	// Force ConvexProvider to reinitialize when organization changes
	// This ensures we get a fresh auth token with the new organization context
	useEffect(() => {
		setConvexKey((prevKey) => prevKey + 1);
	}, [organization?.id]);

	return (
		<ConvexProviderWithClerk key={convexKey} client={convex} useAuth={useAuth}>
			{children as any}
		</ConvexProviderWithClerk>
	);
}

export default function RootLayout() {
	const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

	// Load Outfit font (same as web app)
	const [fontsLoaded, fontError] = useFonts({
		Outfit_400Regular,
		Outfit_500Medium,
		Outfit_600SemiBold,
		Outfit_700Bold,
	});

	useEffect(() => {
		if (fontsLoaded || fontError) {
			// Hide splash screen once fonts are loaded
			SplashScreen.hide();
		}
	}, [fontsLoaded, fontError]);

	if (!publishableKey) {
		throw new Error(
			"Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY. Please set it in your .env file."
		);
	}

	// Keep showing splash screen while fonts are loading
	if (!fontsLoaded && !fontError) {
		return null;
	}

	return (
		<ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
			<ClerkLoaded>
				<ConvexClerkProvider>
					<View style={{ flex: 1 }}>
						<StatusBar style="auto" />
						<Stack screenOptions={{ headerShown: false }}>
							<Stack.Screen name="(tabs)" />
							<Stack.Screen name="(auth)" />
							<Stack.Screen name="index" />
							<Stack.Screen
								name="org-switch"
								options={{
									presentation: "formSheet",
									contentStyle: { backgroundColor: "transparent" },
									headerShown: false,
									sheetAllowedDetents: [0.52, 0.9],
									sheetInitialDetentIndex: 0,
									sheetGrabberVisible: false,
									sheetCornerRadius: 30,
								}}
							/>
							<Stack.Screen
								name="day-sheet"
								options={{
									presentation: "formSheet",
									contentStyle: { backgroundColor: "transparent" },
									headerShown: false,
									sheetAllowedDetents: [0.52, 0.9],
									sheetInitialDetentIndex: 0,
									sheetGrabberVisible: false,
									sheetCornerRadius: 30,
								}}
							/>
							<Stack.Screen
								name="notifications"
								options={{
									presentation: "formSheet",
									contentStyle: { backgroundColor: "transparent" },
									headerShown: false,
									sheetAllowedDetents: [0.52, 0.9],
									sheetInitialDetentIndex: 0,
									sheetGrabberVisible: false,
									sheetCornerRadius: 30,
								}}
							/>
							<Stack.Screen
								name="journey"
								options={{
									presentation: "formSheet",
									contentStyle: { backgroundColor: "transparent" },
									headerShown: false,
									sheetAllowedDetents: [0.52, 0.9],
									sheetInitialDetentIndex: 0,
									sheetGrabberVisible: false,
									sheetCornerRadius: 30,
								}}
							/>
							<Stack.Screen
								name="tasks/form"
								options={{
									presentation: "formSheet",
									contentStyle: { backgroundColor: "transparent" },
									headerShown: false,
									sheetAllowedDetents: [0.9, 1.0],
									sheetInitialDetentIndex: 0,
									sheetGrabberVisible: false,
									sheetCornerRadius: 30,
								}}
							/>
						</Stack>
					</View>
				</ConvexClerkProvider>
			</ClerkLoaded>
		</ClerkProvider>
	);
}
