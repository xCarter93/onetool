import { useSmoothText, type UIMessage } from "@convex-dev/agent/react";
import { StyleSheet, Text, View } from "react-native";
import { fontFamily, radii, type, useTokens } from "@/lib/theme";
import { mapWebPathToMobileRoute } from "@/lib/assistant-nav";
import { MarkdownLiteView } from "./markdown-lite-view";
import { ResultPanel, ToolChip, ToolResult } from "./renderers";

/** Minimal shape of an AI SDK ToolUIPart as surfaced by @convex-dev/agent. */
export interface AssistantToolPart {
	type: string;
	toolCallId?: string;
	state?: string;
	input?: unknown;
	output?: unknown;
}

function isToolPart(part: { type: string }): part is AssistantToolPart {
	return part.type.startsWith("tool-");
}

interface NavigateOutput {
	ok?: boolean;
	path?: string;
	reason?: string;
}

/** tool-navigate: the actual router.push happens once in assistant-chat's
 *  replay-guarded effect — this only reports what happened in the transcript. */
function NavigateChip({ part }: { part: AssistantToolPart }) {
	const t = useTokens();
	if (part.state !== "output-available") {
		return <ToolChip name="navigate" state={part.state} />;
	}
	const output = part.output as NavigateOutput | undefined;
	const path = typeof output?.path === "string" ? output.path : undefined;
	if (!path) return <ToolChip name="navigate" state={part.state} />;
	if (!output?.ok) {
		return (
			<ResultPanel>
				<Text style={[styles.chipText, { color: t.faint }]}>
					Couldn&apos;t open that page.
				</Text>
			</ResultPanel>
		);
	}
	const mobileRoute = mapWebPathToMobileRoute(path);
	if (!mobileRoute) {
		return (
			<ResultPanel>
				<Text style={[styles.chipText, { color: t.faint }]}>
					I opened that page on the web version of the app — it isn&apos;t
					available here yet.
				</Text>
			</ResultPanel>
		);
	}
	return (
		<ResultPanel>
			<Text style={[styles.chipText, { color: t.faint }]}>Opened that for you.</Text>
		</ResultPanel>
	);
}

function ConfigureReportChip() {
	const t = useTokens();
	return (
		<ResultPanel>
			<Text style={[styles.chipText, { color: t.faint }]}>
				The report builder lives in the web app.
			</Text>
		</ResultPanel>
	);
}

function TextPart({ text, streaming }: { text: string; streaming: boolean }) {
	const [visibleText] = useSmoothText(text, { startStreaming: streaming });
	return <MarkdownLiteView text={visibleText} />;
}

export function UserBubble({ message }: { message: UIMessage }) {
	const t = useTokens();
	const text = message.parts
		.filter((p) => p.type === "text")
		.map((p) => (p as { text: string }).text)
		.join("");
	return (
		<View style={styles.userRow}>
			<View style={[styles.userBubble, { backgroundColor: t.secondary }]}>
				<Text style={[styles.userText, { color: t.ink }]}>{text}</Text>
			</View>
		</View>
	);
}

export function AssistantMessage({ message }: { message: UIMessage }) {
	const streaming = message.status === "streaming";
	return (
		<View style={styles.assistantCol}>
			{message.parts.map((part, i) => {
				if (part.type === "text") {
					const text = (part as { text: string }).text;
					if (!text) return null;
					return <TextPart key={i} text={text} streaming={streaming} />;
				}
				if (isToolPart(part)) {
					const name = part.type.replace(/^tool-/, "");
					if (name === "navigate") {
						return <NavigateChip key={i} part={part} />;
					}
					if (name === "configureReport") {
						return <ConfigureReportChip key={i} />;
					}
					return (
						<ToolResult key={i} name={name} state={part.state} output={part.output} />
					);
				}
				return null;
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	userRow: {
		flexDirection: "row",
		justifyContent: "flex-end",
	},
	userBubble: {
		maxWidth: "85%",
		borderRadius: radii.card,
		borderBottomRightRadius: 4,
		paddingHorizontal: 14,
		paddingVertical: 10,
	},
	userText: {
		fontFamily: fontFamily.regular,
		fontSize: type.body,
		lineHeight: 20,
	},
	assistantCol: {
		gap: 6,
	},
	chipText: {
		fontFamily: fontFamily.regular,
		fontSize: type.sm,
	},
});
