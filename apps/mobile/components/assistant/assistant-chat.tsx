import { useEffect, useRef, useState } from "react";
import {
	ActivityIndicator,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { router, type Href } from "expo-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { optimisticallySendMessage, useUIMessages } from "@convex-dev/agent/react";
import { History, MessageSquarePlus, Sparkles } from "lucide-react-native";
import { fontFamily, radii, touch, type, useTokens } from "@/lib/theme";
import { mapWebPathToMobileRoute } from "@/lib/assistant-nav";
import { Composer } from "./composer";
import { AssistantMessage, UserBubble, type AssistantToolPart } from "./message-parts";

const SUGGESTIONS = [
	"What's on my schedule today?",
	"Which invoices are overdue?",
	"Create a task for tomorrow",
];

/**
 * Mobile assistant chat — owns thread state, message list, composer, and
 * streaming. Mirrors the web panel's data flow (apps/web assistant-panel.tsx):
 * createThread once, sendMessage (optimistic) + streamResponse per turn, with
 * a pendingRetryRef so a failed stream can retry without re-saving the prompt.
 * The parent (assistant-host.tsx) gates on premium access — this component
 * assumes it is only ever mounted for an entitled user.
 */
export function AssistantChat({ screenContext }: { screenContext?: string }) {
	const t = useTokens();
	const scrollRef = useRef<ScrollView>(null);

	const [threadId, setThreadId] = useState<string | null>(null);
	const [resumeAttempted, setResumeAttempted] = useState(false);
	const [input, setInput] = useState("");
	const [isResponding, setIsResponding] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [showHistory, setShowHistory] = useState(false);

	// User message already saved but streamResponse failed — retry must reuse
	// this messageId instead of re-saving a duplicate user message.
	const pendingRetryRef = useRef<{
		threadId: string;
		prompt: string;
		messageId: string;
	} | null>(null);
	// Replay guard for client-executed tool calls (navigate): null = seed from
	// the next snapshot without executing (resuming a thread with prior
	// history); a fresh empty Set = execute immediately (brand-new thread).
	const seenClientToolCallsRef = useRef<Set<string> | null>(null);

	const threads = useQuery(api.assistantChat.listThreads);
	const messages = useUIMessages(
		api.assistantChat.listThreadMessages,
		threadId ? { threadId } : "skip",
		{ initialNumItems: 30, stream: true }
	);
	const createThread = useMutation(api.assistantChat.createThread);
	const sendMessage = useMutation(
		api.assistantChat.sendMessage
	).withOptimisticUpdate((store, args) => {
		optimisticallySendMessage(api.assistantChat.listThreadMessages)(store, {
			threadId: args.threadId,
			prompt: args.prompt,
		});
	});
	const streamResponse = useAction(api.assistantChat.streamResponse);

	// Resume the most recently active thread once threads have loaded. This is
	// a render-time derivation (guarded by resumeAttempted so it fires exactly
	// once), not a useEffect setState — apps/mobile lints setState-in-effect as
	// an error; see lib/useDayScope.ts for the sibling async pattern.
	if (!resumeAttempted && threads !== undefined) {
		setResumeAttempted(true);
		if (threadId === null && threads.length > 0) {
			setThreadId(threads[0].threadId);
		}
	}

	const results = messages.results ?? [];

	useEffect(() => {
		scrollRef.current?.scrollToEnd({ animated: true });
	}, [results.length, isResponding]);

	// Client-executed tools: the server only validates the path; the actual
	// route push happens here, once per toolCallId, when a new tool-navigate
	// result streams in (mirrors web's useNavigateToolEffect).
	useEffect(() => {
		if (messages.status === "LoadingFirstPage" || !messages.results) return;
		const navigateParts = messages.results
			.filter((m) => m.role === "assistant")
			.map((m) =>
				(m.parts as unknown as AssistantToolPart[]).filter(
					(p) =>
						p.type === "tool-navigate" &&
						p.state === "output-available" &&
						typeof p.toolCallId === "string"
				)
			);
		// First non-loading snapshot is thread history — record, don't replay.
		if (seenClientToolCallsRef.current === null) {
			seenClientToolCallsRef.current = new Set(
				navigateParts.flat().map((p) => p.toolCallId as string)
			);
			return;
		}
		for (const parts of navigateParts) {
			for (const part of parts) {
				const id = part.toolCallId as string;
				if (seenClientToolCallsRef.current.has(id)) continue;
				seenClientToolCallsRef.current.add(id);
				const output = part.output as { ok?: boolean; path?: string };
				if (output?.ok && typeof output.path === "string") {
					const mobileRoute = mapWebPathToMobileRoute(output.path);
					if (mobileRoute) router.push(mobileRoute as Href);
				}
			}
		}
	}, [messages.results, messages.status]);

	const handleSend = async (promptOverride?: string) => {
		const prompt = (promptOverride ?? input).trim();
		if (!prompt || isResponding) return;
		setInput("");
		setIsResponding(true);
		setError(null);
		try {
			let tid = threadId;
			if (!tid) {
				const created = await createThread({});
				tid = created.threadId;
				setThreadId(tid);
				// New thread has no history — client tool calls run right away.
				seenClientToolCallsRef.current = new Set();
			}
			const pending = pendingRetryRef.current;
			let messageId: string;
			if (pending && pending.threadId === tid && pending.prompt === prompt) {
				messageId = pending.messageId;
			} else {
				const sent = await sendMessage({ threadId: tid, prompt });
				messageId = sent.messageId;
				pendingRetryRef.current = { threadId: tid, prompt, messageId };
			}
			await streamResponse({
				threadId: tid,
				promptMessageId: messageId,
				screenContext,
			});
			pendingRetryRef.current = null;
		} catch {
			// Restore the failed prompt, but never clobber a newer draft.
			setInput((current) => (current.trim() ? current : prompt));
			setError("The assistant hit a snag.");
		} finally {
			setIsResponding(false);
		}
	};

	const handleRetry = () => {
		const pending = pendingRetryRef.current;
		if (pending) void handleSend(pending.prompt);
	};

	const startNewChat = () => {
		setThreadId(null);
		setInput("");
		setError(null);
		setShowHistory(false);
		pendingRetryRef.current = null;
		seenClientToolCallsRef.current = null;
	};

	const openThread = (tid: string) => {
		setShowHistory(false);
		if (tid === threadId) return;
		setThreadId(tid);
		setError(null);
		pendingRetryRef.current = null;
		// Historical thread: seed the replay baseline from its first snapshot so
		// past tool effects (navigate) never re-run.
		seenClientToolCallsRef.current = null;
	};

	const lastMessage = results[results.length - 1];
	const runningToolPart =
		lastMessage?.role === "assistant"
			? (lastMessage.parts as unknown as AssistantToolPart[]).find(
					(p) =>
						p.type.startsWith("tool-") &&
						p.state !== "output-available" &&
						p.state !== "output-error"
				)
			: undefined;
	const isStreamingText =
		lastMessage?.role === "assistant" &&
		lastMessage.status === "streaming" &&
		lastMessage.parts.some(
			(p) => p.type === "text" && (p as { text: string }).text.length > 0
		);
	// The assistant runs multi-step (reason → call tools → answer) and
	// streamResponse stays open the whole run, so isResponding is true start to
	// finish — only show "Thinking…" when nothing else already signals activity.
	const showThinking = isResponding && !runningToolPart && !isStreamingText;

	const showLoadingHistory = !!threadId && messages.status === "LoadingFirstPage";
	const showEmptyState = !showLoadingHistory && results.length === 0;

	return (
		<KeyboardAvoidingView
			style={styles.flex}
			behavior={Platform.OS === "ios" ? "padding" : undefined}
		>
			<View style={[styles.header, { borderBottomColor: t.lineSoft }]}>
				<View style={styles.headerTitleRow}>
					<Sparkles size={16} color={t.frostedInk} />
					<Text style={[styles.headerTitle, { color: t.ink }]}>Assistant</Text>
				</View>
				<View style={styles.headerActions}>
					<Pressable
						onPress={() => setShowHistory((v) => !v)}
						hitSlop={8}
						accessibilityRole="button"
						accessibilityLabel={
							showHistory ? "Back to the conversation" : "Previous conversations"
						}
						style={styles.newChatBtn}
					>
						<History size={16} color={showHistory ? t.frostedInk : t.sub} />
						<Text
							style={[
								styles.newChatText,
								{ color: showHistory ? t.frostedInk : t.sub },
							]}
						>
							History
						</Text>
					</Pressable>
					<Pressable
						onPress={startNewChat}
						hitSlop={8}
						accessibilityRole="button"
						accessibilityLabel="Start a new conversation"
						style={styles.newChatBtn}
					>
						<MessageSquarePlus size={16} color={t.sub} />
						<Text style={[styles.newChatText, { color: t.sub }]}>New chat</Text>
					</Pressable>
				</View>
			</View>

			{showHistory ? (
				<ScrollView
					style={styles.flex}
					contentContainerStyle={styles.historyList}
					keyboardShouldPersistTaps="handled"
				>
					{threads === undefined ? (
						<View style={styles.centerFill}>
							<ActivityIndicator size="small" color={t.faint} />
						</View>
					) : threads.length === 0 ? (
						<Text style={[styles.historyEmpty, { color: t.sub }]}>
							No conversations yet
						</Text>
					) : (
						threads.map((thread) => (
							<Pressable
								key={thread.threadId}
								onPress={() => openThread(thread.threadId)}
								accessibilityRole="button"
								style={[
									styles.historyRow,
									// frostedBg alone can't carry selection (1.10:1) — the
									// primarySolid border is the actual indicator.
									thread.threadId === threadId && {
										backgroundColor: t.frostedBg,
										borderColor: t.primarySolid,
									},
								]}
							>
								<Text
									style={[styles.historyTitle, { color: t.ink }]}
									numberOfLines={1}
								>
									{thread.title}
								</Text>
								<Text style={[styles.historyDate, { color: t.sub }]}>
									{new Date(thread.lastMessageAt).toLocaleDateString(
										undefined,
										{ month: "short", day: "numeric" }
									)}
								</Text>
							</Pressable>
						))
					)}
				</ScrollView>
			) : showLoadingHistory ? (
				<View style={styles.centerFill}>
					<ActivityIndicator size="small" color={t.faint} />
				</View>
			) : showEmptyState ? (
				<View style={styles.emptyState}>
					<View style={[styles.emptyMark, { backgroundColor: t.frostedBg }]}>
						<Sparkles size={22} color={t.frostedInk} strokeWidth={2.2} />
					</View>
					<Text style={[styles.emptyCopy, { color: t.sub }]}>
						Ask anything about your business — I can look at live data across
						your whole workspace.
					</Text>
					<View style={styles.suggestions}>
						{SUGGESTIONS.map((s) => (
							<Pressable
								key={s}
								onPress={() => void handleSend(s)}
								disabled={isResponding}
								accessibilityRole="button"
								style={[
									styles.suggestionChip,
									{ borderColor: t.line, opacity: isResponding ? 0.5 : 1 },
								]}
							>
								<Text style={[styles.suggestionText, { color: t.ink }]}>{s}</Text>
							</Pressable>
						))}
					</View>
				</View>
			) : (
				<ScrollView
					ref={scrollRef}
					style={styles.flex}
					contentContainerStyle={styles.messages}
					keyboardShouldPersistTaps="handled"
					onContentSizeChange={() =>
						scrollRef.current?.scrollToEnd({ animated: true })
					}
				>
					{results.map((message) => {
						if (message.role === "user") {
							return <UserBubble key={message.key} message={message} />;
						}
						if (message.role === "assistant") {
							return <AssistantMessage key={message.key} message={message} />;
						}
						return null;
					})}
					{showThinking ? (
						<View style={styles.thinkingRow}>
							<ActivityIndicator size="small" color={t.faint} />
							<Text style={[styles.thinkingText, { color: t.faint }]}>
								Thinking…
							</Text>
						</View>
					) : null}
					{error ? (
						<View style={styles.errorRow}>
							<Text style={[styles.errorText, { color: t.destructive }]}>
								{error}
							</Text>
							<Pressable
								onPress={handleRetry}
								hitSlop={8}
								accessibilityRole="button"
								accessibilityLabel="Try sending that again"
							>
								<Text style={[styles.retryText, { color: t.frostedInk }]}>
									Try again
								</Text>
							</Pressable>
						</View>
					) : null}
				</ScrollView>
			)}

			{!showHistory ? (
				<Composer
					value={input}
					onChangeText={setInput}
					onSend={() => void handleSend()}
					disabled={isResponding}
				/>
			) : null}
		</KeyboardAvoidingView>
	);
}

const styles = StyleSheet.create({
	flex: {
		flex: 1,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 20,
		paddingBottom: 12,
		borderBottomWidth: 1,
	},
	headerTitleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	headerTitle: {
		fontFamily: fontFamily.bold,
		fontSize: type.h2,
	},
	headerActions: {
		flexDirection: "row",
		alignItems: "center",
		gap: 14,
	},
	newChatBtn: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		minHeight: touch.min,
		paddingHorizontal: 4,
	},
	newChatText: {
		fontFamily: fontFamily.medium,
		fontSize: type.sm,
	},
	centerFill: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	emptyState: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 14,
		paddingHorizontal: 32,
	},
	emptyMark: {
		width: 52,
		height: 52,
		borderRadius: radii.card,
		alignItems: "center",
		justifyContent: "center",
	},
	emptyCopy: {
		fontFamily: fontFamily.regular,
		fontSize: type.body,
		lineHeight: 20,
		textAlign: "center",
	},
	suggestions: {
		width: "100%",
		gap: 8,
	},
	suggestionChip: {
		borderWidth: 1,
		borderRadius: radii.card,
		paddingHorizontal: 14,
		paddingVertical: 12,
		minHeight: touch.min,
		justifyContent: "center",
	},
	suggestionText: {
		fontFamily: fontFamily.regular,
		fontSize: type.body,
	},
	historyList: {
		paddingHorizontal: 12,
		paddingVertical: 10,
		gap: 2,
	},
	historyEmpty: {
		fontFamily: fontFamily.regular,
		fontSize: type.body,
		textAlign: "center",
		paddingVertical: 32,
	},
	historyRow: {
		borderRadius: radii.card,
		borderWidth: 1,
		borderColor: "transparent",
		paddingHorizontal: 14,
		paddingVertical: 10,
		minHeight: touch.min,
		justifyContent: "center",
		gap: 1,
	},
	historyTitle: {
		fontFamily: fontFamily.medium,
		fontSize: type.body,
	},
	historyDate: {
		fontFamily: fontFamily.regular,
		fontSize: type.meta,
	},
	messages: {
		paddingHorizontal: 20,
		paddingVertical: 16,
		gap: 16,
	},
	thinkingRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	thinkingText: {
		fontFamily: fontFamily.regular,
		fontSize: type.sm,
	},
	errorRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
	},
	errorText: {
		fontFamily: fontFamily.regular,
		fontSize: type.sm,
	},
	retryText: {
		fontFamily: fontFamily.semibold,
		fontSize: type.sm,
	},
});
