import { Stack } from "expo-router";

// Shared AppHeader is rendered inside each screen now — the stack shows no header.
// quote/[id] + invoice/[id] detail screens land in 23-03/23-04; declaring them
// here is harmless and keeps the stack explicit.
export default function MoneyLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="quote/[id]" />
      <Stack.Screen name="invoice/[id]" />
    </Stack>
  );
}
