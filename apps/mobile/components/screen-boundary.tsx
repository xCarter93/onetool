import React from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { ConvexError } from "convex/values";
import { ShieldOff, TriangleAlert } from "lucide-react-native";
import { EmptyPanel, GUTTER } from "@/components/canvas";
import { Button } from "@/components/ui/button";

export function isForbidden(error: unknown): boolean {
	return (
		error instanceof ConvexError &&
		(error.data as { code?: string } | undefined)?.code === "FORBIDDEN"
	);
}

function ScreenError({ forbidden, onRetry }: { forbidden: boolean; onRetry: () => void }) {
	return (
		<View style={styles.wrap}>
			<EmptyPanel
				icon={forbidden ? ShieldOff : TriangleAlert}
				title={forbidden ? "No access" : "Something went wrong"}
				body={
					forbidden
						? "Your role doesn't include this. Ask an admin to update your access."
						: "This screen hit an error. Your data is safe."
				}
				action={
					<View style={styles.actions}>
						{forbidden ? null : <Button title="Try again" onPress={onRetry} />}
						<Button
							title="Go to Today"
							variant={forbidden ? "primary" : "secondary"}
							onPress={() => router.dismissTo("/")}
						/>
					</View>
				}
			/>
		</View>
	);
}

/**
 * Per-screen error boundary. Convex queries throw during render (FORBIDDEN for
 * a role without access), and the root boundary tears down the navigator with
 * the layout, leaving nothing to navigate away with. Catching here keeps the
 * frame and navigation alive. Callers key it by route or selection.
 */
export class ScreenBoundary extends React.Component<
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
		return (
			<ScreenError
				forbidden={isForbidden(error)}
				onRetry={() => this.setState({ error: null })}
			/>
		);
	}
}

const styles = StyleSheet.create({
	wrap: {
		flex: 1,
		justifyContent: "center",
		padding: GUTTER,
	},
	actions: {
		gap: 8,
		alignSelf: "stretch",
	},
});
