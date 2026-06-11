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
import { useDevice } from "@/lib/use-device";
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

// Overlay presentation per device (26-05, Strategy B). iPhone keeps the native
// `formSheet` bottom sheet BYTE-IDENTICAL (detents preserved); iPad swaps to a
// transparent full-screen modal so the body's own CenteredModal owns the scrim +
// centered card (no native-sheet double-frame). `iPhoneSheet` carries the exact
// per-screen detents; only `presentation`/`sheet*` differ by device.
function overlayOptions(
	device: "phone" | "ipad",
	iPhoneSheet: {
		sheetAllowedDetents: number[];
		sheetInitialDetentIndex: number;
		sheetGrabberVisible: boolean;
		sheetCornerRadius: number;
	}
) {
	if (device === "ipad") {
		return {
			presentation: "transparentModal" as const,
			contentStyle: { backgroundColor: "transparent" },
			headerShown: false,
			animation: "fade" as const,
		};
	}
	return {
		presentation: "formSheet" as const,
		contentStyle: { backgroundColor: "transparent" },
		headerShown: false,
		...iPhoneSheet,
	};
}

export default function RootLayout() {
	const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
	// 26-05 Strategy B: iPad overlays present as transparentModal (CenteredModal
	// owns the scrim); iPhone keeps formSheet. useWindowDimensions-backed, so a
	// rotate re-evaluates the branch.
	const { device } = useDevice();

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
							<Stack.Screen name="(onboarding)" />
							<Stack.Screen name="index" />
							{/* Shared document details — root-level so back returns to the
							    origin tab (client/project/money), not the Money stack. */}
							<Stack.Screen name="quote/[id]" />
							<Stack.Screen name="invoice/[id]" />
							<Stack.Screen
								name="org-switch"
								options={overlayOptions(device, {
									sheetAllowedDetents: [0.52, 0.9],
									sheetInitialDetentIndex: 0,
									sheetGrabberVisible: false,
									sheetCornerRadius: 30,
								})}
							/>
							<Stack.Screen
								name="day-sheet"
								options={overlayOptions(device, {
									sheetAllowedDetents: [0.52, 0.9],
									sheetInitialDetentIndex: 0,
									sheetGrabberVisible: false,
									sheetCornerRadius: 30,
								})}
							/>
							<Stack.Screen
								name="notifications"
								options={overlayOptions(device, {
									sheetAllowedDetents: [0.52, 0.9],
									sheetInitialDetentIndex: 0,
									sheetGrabberVisible: false,
									sheetCornerRadius: 30,
								})}
							/>
							<Stack.Screen
								name="journey"
								options={overlayOptions(device, {
									sheetAllowedDetents: [0.52, 0.9],
									sheetInitialDetentIndex: 0,
									sheetGrabberVisible: false,
									sheetCornerRadius: 30,
								})}
							/>
							<Stack.Screen
								name="tasks/form"
								options={overlayOptions(device, {
									sheetAllowedDetents: [0.9, 1.0],
									sheetInitialDetentIndex: 0,
									sheetGrabberVisible: false,
									sheetCornerRadius: 30,
								})}
							/>
							{/* Short fixed detent — two create rows + title (hand-tune in <verification>). */}
							<Stack.Screen
								name="create"
								options={overlayOptions(device, {
									sheetAllowedDetents: [0.4],
									sheetInitialDetentIndex: 0,
									sheetGrabberVisible: false,
									sheetCornerRadius: 30,
								})}
							/>
							{/* Near-full search overlay. Opens at 0.9 (draggable to full) so the
							    input clears the status bar — a single [1.0] detent renders content
							    under the notch (matches tasks/form's [0.9, 1.0] pattern). */}
							<Stack.Screen
								name="search"
								options={overlayOptions(device, {
									sheetAllowedDetents: [0.9, 1.0],
									sheetInitialDetentIndex: 0,
									sheetGrabberVisible: false,
									sheetCornerRadius: 30,
								})}
							/>
						</Stack>
					</View>
				</ConvexClerkProvider>
			</ClerkLoaded>
		</ClerkProvider>
	);
}
