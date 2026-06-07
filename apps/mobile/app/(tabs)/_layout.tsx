import { Tabs, Redirect } from "expo-router";
import { useAuth } from "@clerk/expo";
import { FieldKitTabBar } from "@/components/field-kit-tab-bar";

export default function TabLayout() {
  const { isSignedIn } = useAuth();

  // If the user is not signed in, redirect them to the sign-in page
  if (!isSignedIn) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <FieldKitTabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="clients" options={{ title: "Clients" }} />
      <Tabs.Screen name="tasks" options={{ title: "Tasks" }} />
      <Tabs.Screen name="money" options={{ title: "Money" }} />
      {/* Work kept routable, OFF the bar (per CONTEXT) */}
      <Tabs.Screen name="projects" options={{ href: null }} />
      {/* Profile reached via the header avatar (per CONTEXT) */}
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}
