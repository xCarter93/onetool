import { Fragment } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Check, X } from "lucide-react-native";
import { fontFamily, type, useTokens } from "@/lib/theme";

export type TrackStepState = "done" | "current" | "upcoming" | "failed";

export interface TrackStep {
	key: string;
	label: string;
	state: TrackStepState;
}

// Quote lifecycle track (frame 1h): green check = done, blue ringed dot =
// current, hollow = upcoming, danger X = failed (declined). Connectors take
// the color of the step they lead INTO when it's resolved.
export function StatusTrack({ steps }: { steps: TrackStep[] }) {
	const t = useTokens();
	const nodeColor = (s: TrackStepState) =>
		s === "done"
			? t.success
			: s === "current"
				? t.primaryInk
				: s === "failed"
					? t.danger
					: t.line;

	return (
		<View style={styles.row} accessibilityRole="progressbar">
			{steps.map((step, i) => {
				const resolved = step.state === "done" || step.state === "failed";
				const active = step.state === "current";
				return (
					<Fragment key={step.key}>
						{/* Sibling of the step columns, not nested in a flex cell — every
						    connector gets an equal share, so the track spreads evenly no
						    matter how wide the card is (the old per-step flex cell left
						    the first cell's slack as a dead gap after Draft). */}
						{i > 0 ? (
							<View
								style={[
									styles.connector,
									{
										backgroundColor:
											resolved || active ? nodeColor(steps[i - 1].state) : t.line,
									},
								]}
							/>
						) : null}
						<View style={styles.step}>
							<View
								style={[
									styles.node,
									resolved || active
										? { backgroundColor: nodeColor(step.state) }
										: {
												backgroundColor: t.card,
												borderWidth: 2,
												borderColor: t.line,
											},
									active && {
										boxShadow: `0 0 0 4px ${t.frostedBg}`,
									},
								]}
							>
								{step.state === "done" ? (
									<Check size={13} color="#fff" strokeWidth={3} />
								) : step.state === "failed" ? (
									<X size={12} color="#fff" strokeWidth={3} />
								) : null}
							</View>
							<Text
								style={[
									styles.label,
									{
										color:
											step.state === "current"
												? t.frostedInk
												: step.state === "failed"
													? t.danger
													: step.state === "done"
														? t.sub
														: t.faintDecor,
										fontFamily:
											active || step.state === "failed"
												? fontFamily.semibold
												: fontFamily.medium,
									},
								]}
								numberOfLines={1}
							>
								{step.label}
							</Text>
						</View>
					</Fragment>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "flex-start",
	},
	connector: {
		flex: 1,
		height: 2,
		marginTop: 10,
		marginHorizontal: -8,
		zIndex: 0,
	},
	step: {
		alignItems: "center",
		gap: 4,
		width: 64,
		zIndex: 1,
	},
	node: {
		width: 22,
		height: 22,
		borderRadius: 11,
		alignItems: "center",
		justifyContent: "center",
	},
	label: {
		fontSize: type.micro,
	},
});
