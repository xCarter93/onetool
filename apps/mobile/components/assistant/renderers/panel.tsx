import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { CircleAlert } from "lucide-react-native";
import { Eyebrow } from "@/components/ui";
import { toolChipLabels } from "@/lib/assistant-renderers";
import { fontFamily, radii, type, useTokens } from "@/lib/theme";

/** Compact bordered chip for a one-line tool status. */
export function ResultPanel({ children }: { children: ReactNode }) {
	const t = useTokens();
	return (
		<View style={[styles.chip, { borderColor: t.line }]}>{children}</View>
	);
}

export function ToolChip({ name, state }: { name: string; state?: string }) {
	const t = useTokens();
	const failed = state === "output-error";
	const running = state !== "output-available" && state !== "output-error";
	const { active, done } = toolChipLabels(name);
	return (
		<ResultPanel>
			{failed ? (
				<CircleAlert size={13} color={t.faint} />
			) : running ? (
				<ActivityIndicator size="small" color={t.faint} />
			) : null}
			<Text style={[styles.chipText, { color: t.faint }]}>
				{failed ? `Hit a snag: ${done.toLowerCase()}` : running ? active : done}
			</Text>
		</ResultPanel>
	);
}

/** Full-width bordered panel for a rendered tool result. */
export function Panel({ children }: { children: ReactNode }) {
	const t = useTokens();
	return (
		<View style={[styles.panel, { borderColor: t.line, backgroundColor: t.card }]}>
			{children}
		</View>
	);
}

export function EmptyPanel({ children }: { children: string }) {
	const t = useTokens();
	return (
		<View style={[styles.panel, styles.emptyPanel, { borderColor: t.line }]}>
			<Text style={[styles.meta, { color: t.sub }]}>{children}</Text>
		</View>
	);
}

export function SectionLabel({ icon, children }: { icon?: ReactNode; children: string }) {
	return (
		<View style={styles.sectionLabel}>
			{icon}
			<Eyebrow>{children}</Eyebrow>
		</View>
	);
}

/** Row divider inside a panel; skipped above the first row. */
export function Divided({ first, children }: { first: boolean; children: ReactNode }) {
	const t = useTokens();
	return (
		<View style={first ? undefined : { borderTopWidth: 1, borderTopColor: t.lineSoft }}>
			{children}
		</View>
	);
}

export function MoreNote({ hidden }: { hidden: number }) {
	const t = useTokens();
	if (hidden <= 0) return null;
	return <Text style={[styles.meta, styles.more, { color: t.sub }]}>+{hidden} more</Text>;
}

export const text = StyleSheet.create({
	primary: {
		fontFamily: fontFamily.regular,
		fontSize: type.body,
	},
	secondary: {
		fontFamily: fontFamily.regular,
		fontSize: type.meta,
		marginTop: 1,
	},
	number: {
		fontFamily: fontFamily.medium,
		fontSize: type.body,
		fontVariant: ["tabular-nums"],
	},
});

const styles = StyleSheet.create({
	chip: {
		flexDirection: "row",
		alignItems: "center",
		alignSelf: "flex-start",
		gap: 6,
		borderWidth: 1,
		borderRadius: radii.card,
		paddingHorizontal: 10,
		paddingVertical: 8,
	},
	chipText: {
		fontFamily: fontFamily.regular,
		fontSize: type.sm,
	},
	panel: {
		alignSelf: "stretch",
		borderWidth: 1,
		borderRadius: radii.card,
		paddingHorizontal: 14,
		paddingVertical: 10,
	},
	emptyPanel: {
		alignSelf: "flex-start",
	},
	meta: {
		fontFamily: fontFamily.regular,
		fontSize: type.meta,
	},
	more: {
		paddingTop: 6,
	},
	sectionLabel: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		marginBottom: 2,
	},
});
