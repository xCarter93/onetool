import {
	ClerkProvider,
	ClerkLoaded,
	useAuth,
	useOrganization,
} from "@clerk/expo";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import {
	ConvexReactClient,
	useConvexAuth,
	useMutation,
	useQuery,
} from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import * as Notifications from "expo-notifications";
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
import { LaunchOverlay } from "@/components/launch/LaunchOverlay";
import { useLaunchReadiness } from "@/lib/use-launch-readiness";
import {
	PushRegistrationHost,
	usePushBridge,
} from "@/components/push/PushRegistrationHost";

// Module-level cold-start replay guard. Survives the ConvexClerkProvider
// key={convexKey} remount on org switch because RootLayout itself never remounts —
// so an org switch never replays the brand animation (Pitfall 2 / T-27-04).
let hasPlayedLaunch = false;

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

// Set the animation options (optional)
SplashScreen.setOptions({
	duration: 1000,
	fade: true,
});

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!);

// Root error boundary (expo-router convention): catches any render throw in the
// app — including Convex useQuery errors, which throw during render — and shows
// a recoverable error screen instead of hard-crashing the app.
export { ErrorScreen as ErrorBoundary } from "@/components/ErrorScreen";

function ConvexClerkProvider({ children }: PropsWithChildren) {
	const { organization } = useOrganization();

	// Keying on the active org id remounts the provider on org change, so we get
	// a fresh auth token with the new organization context.
	return (
		<ConvexProviderWithClerk
			key={organization?.id ?? "no-org"}
			client={convex}
			useAuth={useAuth}
		>
			{children as any}
		</ConvexProviderWithClerk>
	);
}

// Thin inner Convex child (UNDER ConvexClerkProvider). Owns the three things that
// need Convex: (a) idempotent token upsert via registerToken; (b) publishing the
// markRead mutation UP to the host so its tap handler can mark a push read;
// (c) APP-WIDE badge sync from the reactive unread count (works whether or not the
// notifications screen is open — PUSH-06). Remounts harmlessly on org switch.
function PushConvexChild() {
	const { registerMarkRead, pushToken } = usePushBridge();
	const { isAuthenticated } = useConvexAuth();
	const registerToken = useMutation(api.push.registerToken);
	const markRead = useMutation(api.notifications.markRead);
	const notificationData = useQuery(api.notifications.listForCurrentUser, {
		limit: 1,
	});
	const unreadCount = notificationData?.unreadCount;

	// Publish markRead up to the host (re-publishes after each org-switch remount).
	useEffect(() => {
		registerMarkRead((args) => markRead(args));
	}, [registerMarkRead, markRead]);

	// Idempotent upsert-by-token — a remount-driven re-write is harmless (plan 01).
	// registerToken is a raw mutation that throws when unauthenticated, so wait
	// for the Convex identity to attach (a cached push token can resolve first).
	useEffect(() => {
		if (!pushToken || !isAuthenticated) return;
		void registerToken({ token: pushToken, platform: "ios" });
	}, [pushToken, registerToken, isAuthenticated]);

	// TODO(cross-org badge): unreadCount is ACTIVE-ORG scoped (Pitfall 5), so a
	// multi-org user sees only the active org's unread count. A cross-org
	// unreadCountForUser query is the documented future fix.
	useEffect(() => {
		if (unreadCount != null) void Notifications.setBadgeCountAsync(unreadCount);
	}, [unreadCount]);

	return null;
}

// Mounts the animated launch overlay as a SIBLING of `children` (the
// ClerkLoaded > ConvexClerkProvider subtree), inside ClerkProvider but ABOVE the
// Convex remount boundary. useLaunchReadiness calls Clerk useAuth — valid here
// because LaunchHost is under ClerkProvider; the overlay animates immediately on
// cold start WHILE Clerk is still loading (not gated on ClerkLoaded). Once
// dismissed, the module-level hasPlayedLaunch flag keeps an org switch from
// replaying it.
function LaunchHost({
	fontsLoaded,
	fontError,
	children,
}: PropsWithChildren<{ fontsLoaded: boolean; fontError: Error | null }>) {
	const [showLaunch, setShowLaunch] = useState(!hasPlayedLaunch);
	const ready = useLaunchReadiness(fontsLoaded, fontError);

	return (
		<>
			{children}
			{showLaunch && (
				<LaunchOverlay
					ready={ready}
					onFirstFrameReady={() => SplashScreen.hide()}
					onDismissed={() => {
						hasPlayedLaunch = true;
						setShowLaunch(false);
					}}
				/>
			)}
		</>
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

	// Native-splash hand-off is re-sequenced (Pitfall 4): hide() is NO LONGER tied
	// to font load — it fires from LaunchOverlay's onFirstFrameReady (onLayout) so
	// the JS overlay paints BEFORE the native splash is removed (no blank frame).

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
			<LaunchHost fontsLoaded={fontsLoaded} fontError={fontError}>
				{/* PushRegistrationHost mirrors LaunchHost: foreground handler + tap
				    listeners + cross-org setActive live ABOVE the Convex remount
				    boundary so an org switch never tears them down. The token-write /
				    markRead / badge child (PushConvexChild) sits UNDER Convex. */}
				<PushRegistrationHost>
					<ClerkLoaded>
						<ConvexClerkProvider>
							<PushConvexChild />
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
				</PushRegistrationHost>
			</LaunchHost>
		</ClerkProvider>
	);
}
