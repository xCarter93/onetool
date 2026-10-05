import { Stack } from "expo-router";
import { frame } from "@/lib/theme";
import WorkScreen from "../(work)/work";

export default function SearchScreen() {
	return (
		<>
			{/* The search bar forces a native header; keep it an opaque canvas band the notch sits in. */}
			<Stack.Screen
				options={{
					title: "",
					headerShadowVisible: false,
					headerStyle: { backgroundColor: frame.canvas },
					scrollEdgeEffects: { top: "hidden" },
				}}
			/>
			<WorkScreen headerMode="search" />
		</>
	);
}
