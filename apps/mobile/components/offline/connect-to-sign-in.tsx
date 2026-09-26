import { useEffect, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "@clerk/expo";
import { fontFamily, type, useTokens } from "@/lib/theme";
import { useIsOnline } from "@/lib/offline/network";

// Long enough for a slow cold start online; offline without a Clerk cache the
// SDK never loads, so after this the user needs a reason, not a blank screen.
const WAIT_MS = 6000;

export function ConnectToSignInGate({ children }: { children: ReactNode }) {
	const { isLoaded } = useAuth();
	const online = useIsOnline();
	const t = useTokens();
	const [waited, setWaited] = useState(false);

	useEffect(() => {
		if (isLoaded) return;
		const timer = setTimeout(() => setWaited(true), WAIT_MS);
		return () => clearTimeout(timer);
	}, [isLoaded]);

	if (isLoaded || !waited || online) return <>{children}</>;

	return (
		<View style={[styles.root, { backgroundColor: t.bg }]} accessibilityRole="summary">
			<Text style={[styles.title, { color: t.ink }]}>Connect to sign in</Text>
			<Text style={[styles.body, { color: t.sub }]}>
				OneTool needs a connection the first time you sign in on this phone. After that, your day
				stays available without signal.
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1, justifyContent: "center", paddingHorizontal: 32, gap: 8 },
	title: { fontFamily: fontFamily.semibold, fontSize: type.h1 },
	body: { fontFamily: fontFamily.regular, fontSize: type.body, lineHeight: 20 },
});
