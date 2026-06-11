import { Stack } from "expo-router";

// Onboarding route group. No redirect logic here — routing INTO this group
// (post-auth, no active org) is owned by plan 25-05's post-auth boundary.
export default function OnboardingLayout() {
	return <Stack screenOptions={{ headerShown: false }} />;
}
