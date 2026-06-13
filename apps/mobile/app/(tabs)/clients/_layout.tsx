import { Stack } from "expo-router";

// Shared AppHeader is rendered inside each screen now — the stack shows no header.
export default function ClientsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="new" />
      <Stack.Screen name="[clientId]" />
    </Stack>
  );
}
