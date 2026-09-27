import React from "react";
import { StyleSheet, View } from "react-native";
import { ConvexError } from "convex/values";
import { ShieldOff } from "lucide-react-native";
import { EmptyPanel, GUTTER } from "@/components/canvas";

export function isForbidden(error: unknown): boolean {
	return (
		error instanceof ConvexError &&
		(error.data as { code?: string } | undefined)?.code === "FORBIDDEN"
	);
}

function NoAccess() {
	return (
		<View style={styles.wrap}>
			<EmptyPanel
				icon={ShieldOff}
				title="No access"
				body="Your role doesn't include this. Ask an admin to update your access."
			/>
		</View>
	);
}

/**
 * Convex queries throw FORBIDDEN during render for a role without access; this
 * shows that in place of the one screen or pane. Other errors keep propagating.
 * Callers key it by route or selection so moving on clears it.
 */
export class AccessBoundary extends React.Component<
	{ children: React.ReactNode },
	{ error: unknown }
> {
	state = { error: null as unknown };

	static getDerivedStateFromError(error: unknown) {
		return { error };
	}

	render() {
		const { error } = this.state;
		if (error === null) return this.props.children;
		if (!isForbidden(error)) throw error;
		return <NoAccess />;
	}
}

const styles = StyleSheet.create({
	wrap: {
		flex: 1,
		justifyContent: "center",
		padding: GUTTER,
	},
});
