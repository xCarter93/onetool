import { useSmoothText, type UIMessage } from "@convex-dev/agent/react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { CircleAlert } from "lucide-react-native";
import { fontFamily, radii, type, useTokens } from "@/lib/theme";
import { mapWebPathToMobileRoute } from "@/lib/assistant-nav";
import { MarkdownLiteView } from "./markdown-lite-view";

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

// Prefixes that read naturally as a past-tense verb in a status chip; anything
// else falls back to "Ran".
const VERB_MAP: Record<string, string> = {
	get: "Checked",
	list: "Looked up",
	search: "Searched",
	create: "Created",
	update: "Updated",
	plan: "Planned",
	optimize: "Optimized",
	run: "Ran",
	describe: "Looked up",
};

function splitCamelWords(name: string): string[] {
	return name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(" ").filter(Boolean);
}

/** Derives a "Checked schedule" / "Looking up clients…" style chip label from
 *  a raw tool name (e.g. "getSchedule", "listClients"). */
function humanizeToolLabel(name: string): { active: string; done: string } {
	const words = splitCamelWords(name);
	const verbKey = words[0]?.toLowerCase() ?? "";
	const verb = VERB_MAP[verbKey];
	const rest = (verb ? words.slice(1) : words).join(" ").toLowerCase();
	const label = rest ? `${verb ?? "Ran"} ${rest}` : (verb ?? "Ran");
	return { done: label, active: `${label}…` };
}

function ToolChip({ name, state }: { name: string; state?: string }) {
	const t = useTokens();
	const failed = state === "output-error";
	const running = state !== "output-available" && state !== "output-error";
	const { active, done } = humanizeToolLabel(name);
	return (
		<View style={styles.chipRow}>
			{failed ? (
				<CircleAlert size={12} color={t.faint} />
			) : running ? (
				<ActivityIndicator size="small" color={t.faint} />
			) : null}
			<Text style={[styles.chipText, { color: t.faint }]}>
				{failed ? `Hit a snag: ${done.toLowerCase()}` : running ? active : done}
			</Text>
		</View>
	);
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
			<Text style={[styles.chipText, { color: t.faint }]}>
				Couldn&apos;t open that page.
			</Text>
		);
	}
	const mobileRoute = mapWebPathToMobileRoute(path);
	if (!mobileRoute) {
		return (
			<Text style={[styles.chipText, { color: t.faint }]}>
				I opened that page on the web version of the app — it isn&apos;t
				available here yet.
			</Text>
		);
	}
	return (
		<Text style={[styles.chipText, { color: t.faint }]}>Opened that for you.</Text>
	);
}

function ConfigureReportChip() {
	const t = useTokens();
	return (
		<Text style={[styles.chipText, { color: t.faint }]}>
			The report builder lives in the web app.
		</Text>
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
			<View
				style={[
					styles.userBubble,
					{ backgroundColor: t.frostedBg, borderColor: t.frostedBorder },
				]}
			>
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
					return <ToolChip key={i} name={name} state={part.state} />;
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
		borderWidth: 1,
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
	chipRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	chipText: {
		fontFamily: fontFamily.regular,
		fontSize: type.sm,
	},
});
