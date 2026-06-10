import { Stack } from "expo-router";

// Shared AppHeader is rendered inside each screen now — the stack shows no header.
// Quote/invoice detail routes live at the root (app/quote, app/invoice) so back
// returns to the origin tab, not this stack.
export default function MoneyLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
