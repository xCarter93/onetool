import { Stack } from "expo-router";
import { frame } from "@/lib/theme";

// Cold links (push, deep link) land in the first group alphabetically; the
// anchor gives each tab's stack its root screen underneath.
export const unstable_settings = {
	today: { anchor: "index" },
	work: { anchor: "work" },
	money: { anchor: "money" },
	routes: { anchor: "routes" },
};

export default function TabStack() {
	return (
		<Stack
			screenOptions={{
				headerShown: false,
				contentStyle: { backgroundColor: frame.canvas },
			}}
		/>
	);
}
