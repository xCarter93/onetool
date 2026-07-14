"use client";

import { useEffect, useRef, useState } from "react";
import {
	useSmoothText,
	useUIMessages,
	optimisticallySendMessage,
	type UIMessage,
} from "@convex-dev/agent/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { useAction, useMutation, useQuery } from "convex/react";
import {
	ArrowUp,
	Eye,
	History,
	Loader2,
	MessageSquarePlus,
	Pin,
	PinOff,
	Sparkles,
	X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Textarea } from "@/components/ui/textarea";
import { useFeatureAccess } from "@/hooks/use-feature-access";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
	ToolPartRenderer,
	type AssistantToolPart,
} from "./renderers";
import { useCurrentRecord, type CurrentRecord } from "./use-current-record";
import { useScreenContext } from "./use-screen-context";
import { useIsMobile } from "@/hooks/use-mobile";
import {
	useApplyReportConfig,
	useReportBuilderMounted,
} from "./report-config-apply-context";
import type { BuilderReportConfig } from "@onetool/backend/convex/reportConfigGeneration";

const SUGGESTIONS = [
	"What's on the schedule this week?",
	"Chart revenue by month this year",
	"Which invoices are overdue?",
	"Create a task for tomorrow morning",
];

/** Empty-state prompts tailored to what's currently in context. */
function suggestionsFor(
	builderMounted: boolean,
	record: CurrentRecord | null
): string[] {
	if (builderMounted) {
		return [
			"Show only this month",
			"Group this by status",
			"Switch to a pie chart",
			"Show a table of the individual records",
		];
	}
	if (record) {
		const kind = record.kindLabel.toLowerCase();
		return [
			`Summarize this ${kind}`,
			`What's the recent activity on this ${kind}?`,
			record.kindLabel === "Client"
				? "Show this client's open invoices"
				: `What's the status of this ${kind}?`,
			"What should I follow up on?",
		];
	}
	return SUGGESTIONS;
}

// No typography plugin in this app — style markdown elements directly.
const MARKDOWN_CLASS = [
	"break-words leading-relaxed",
	"[&>*+*]:mt-2",
	"[&_strong]:font-semibold",
	"[&_a]:text-primary [&_a]:underline",
	"[&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:mt-1",
	"[&_h1]:text-sm [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold",
	"[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs",
	"[&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:text-xs",
	"[&_table]:block [&_table]:overflow-x-auto [&_table]:text-xs",
	"[&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-medium",
	"[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1",
	"[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
].join(" ");

function TextPart({ text, streaming }: { text: string; streaming: boolean }) {
	const [visibleText] = useSmoothText(text, { startStreaming: streaming });
	return (
		<div className={MARKDOWN_CLASS}>
			<ReactMarkdown remarkPlugins={[remarkGfm]}>{visibleText}</ReactMarkdown>
		</div>
	);
}

function MessageItem({ message }: { message: UIMessage }) {
	const isUser = message.role === "user";
	if (isUser) {
		return (
			<div className="flex justify-end">
				<div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary/10 px-3.5 py-2 text-sm whitespace-pre-wrap break-words">
					{message.parts
						.filter((p) => p.type === "text")
						.map((p, i) => (
							<span key={i}>{(p as { text: string }).text}</span>
						))}
				</div>
			</div>
		);
	}
	return (
		<div className="flex flex-col gap-1.5 text-sm">
			{message.parts.map((part, i) => {
				if (part.type === "text") {
					return (
						<TextPart
							key={i}
							text={(part as { text: string }).text}
							streaming={message.status === "streaming"}
						/>
					);
				}
				if (part.type.startsWith("tool-")) {
					return (
						<ToolPartRenderer
							key={i}
							part={part as unknown as AssistantToolPart}
						/>
					);
				}
				return null;
			})}
		</div>
	);
}

/** "What you're looking at is shared with the assistant" strip — record
 * pages and the report builder. */
function ContextBanner({
	record,
	builderMounted,
}: {
	record: CurrentRecord | null;
	builderMounted: boolean;
}) {
	if (builderMounted) {
		return (
			<div className="flex shrink-0 items-center gap-2 border-b border-border bg-primary/[0.04] px-4 py-2 text-xs">
				<Eye className="size-3.5 shrink-0 text-primary" />
				<span className="min-w-0 truncate">
					<span className="font-medium text-foreground">Report builder</span>
					<span className="text-muted-foreground">
						{" "}
						· ask me to configure the open report
					</span>
				</span>
				<span className="ml-auto shrink-0 text-muted-foreground">
					In context
				</span>
			</div>
		);
	}
	if (!record) return null;
	return (
		<div className="flex shrink-0 items-center gap-2 border-b border-border bg-primary/[0.04] px-4 py-2 text-xs">
			<Eye className="size-3.5 shrink-0 text-primary" />
			{record.name === undefined ? (
				<span className="text-muted-foreground">
					The page you&apos;re viewing is shared as context
				</span>
			) : (
				<>
					<span className="min-w-0 truncate">
						<span className="font-medium text-foreground">{record.name}</span>
						<span className="text-muted-foreground">
							{" "}
							· {record.kindLabel}
						</span>
						{record.status && (
							<span className="capitalize text-muted-foreground">
								{" "}
								· {record.status}
							</span>
						)}
					</span>
					<span className="ml-auto shrink-0 text-muted-foreground">
						In context
					</span>
				</>
			)}
		</div>
	);
}

function HeaderButton({
	onClick,
	label,
	active,
	className,
	children,
}: {
	onClick: () => void;
	label: string;
	active?: boolean;
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"inline-flex cursor-pointer items-center justify-center rounded-lg p-2 text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground",
				active && "bg-foreground/[0.08] text-foreground",
				className
			)}
			aria-label={label}
		>
			{children}
		</button>
	);
}

/** Free-plan body: the panel opens, but chat is replaced by an upgrade prompt.
 *  The backend enforces the same gate in sendMessage/streamResponse. */
function UpgradePrompt() {
	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-8">
			<div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10">
				<Sparkles className="size-6 text-primary" />
			</div>
			<div className="text-center">
				<p className="text-sm font-medium">
					The assistant is part of the Business plan
				</p>
				<p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
					Upgrade to ask questions about your business and let the assistant
					make changes for you.
				</p>
			</div>
			<Link
				href="/organization/profile?tab=billing"
				className="inline-flex h-9 cursor-pointer items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
			>
				View plans
			</Link>
		</div>
	);
}

interface AssistantPanelProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Docked to the workspace's right edge instead of floating (md+ only). */
	pinned: boolean;
	onTogglePin: () => void;
}

export function AssistantPanel({
	open,
	onOpenChange,
	pinned,
	onTogglePin,
}: AssistantPanelProps) {
	const [threadId, setThreadId] = useState<string | null>(null);
	const [showHistory, setShowHistory] = useState(false);
	const [input, setInput] = useState("");
	const [isResponding, setIsResponding] = useState(false);
	// User message already saved but streamResponse failed — retry must reuse
	// this messageId instead of re-saving a duplicate user message.
	const pendingRetryRef = useRef<{
		threadId: string;
		prompt: string;
		messageId: string;
	} | null>(null);
	const bottomRef = useRef<HTMLDivElement>(null);
	const toast = useToast();
	const router = useRouter();
	const getScreenContext = useScreenContext();
	const applyReportConfig = useApplyReportConfig();
	const builderMounted = useReportBuilderMounted();
	const currentRecord = useCurrentRecord();
	const isMobile = useIsMobile();
	// Pinning is a desktop layout mode; on mobile the panel always floats.
	const docked = pinned && !isMobile;
	// While access is loading, show the normal chat UI (no upgrade-prompt flash
	// for premium users); the backend gate blocks any send that sneaks in.
	const { planLimits, isLoading: accessLoading } = useFeatureAccess();
	const locked = !accessLoading && !planLimits.canUseAiAssistant;
	// client-executed tool calls (navigate, configureReport) already run.
	// null = "seed from the next snapshot without executing" (set when
	// opening a historical thread); a fresh empty Set (set at thread
	// creation) means execute immediately — a brand-new thread has no
	// history that could replay.
	const seenClientToolCallsRef = useRef<Set<string> | null>(null);

	const threads = useQuery(
		api.assistantChat.listThreads,
		open && showHistory ? {} : "skip"
	);
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

	const messageCount = messages.results?.length ?? 0;
	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
	}, [messageCount, isResponding]);

	// The assistant runs multi-step (reason → call tools → answer) and
	// streamResponse stays open for the whole run, so isResponding is true
	// start-to-finish. Show a generic "Thinking…" line whenever it's working but
	// nothing else already signals activity — i.e. not while a tool chip shows
	// its own spinner and not while answer text is streaming in. Without this,
	// the indicator vanished the instant the first assistant part arrived and the
	// UI looked idle through the (often long) tool-calling phase.
	const results = messages.results ?? [];
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
	const showThinking = isResponding && !runningToolPart && !isStreamingText;

	useEffect(() => {
		if (!open) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") onOpenChange(false);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [open, onOpenChange]);

	// Client-executed tools: the server only validates/generates; the actual
	// side effect happens here when a new tool result streams in — navigate
	// pushes a route, configureReport applies a config to the open builder.
	useEffect(() => {
		if (messages.status === "LoadingFirstPage" || !messages.results) return;
		const messageParts = messages.results
			.filter((m) => m.role === "assistant")
			.map((m) =>
				m.parts
					.map((p) => p as unknown as AssistantToolPart)
					.filter(
						(p) =>
							(p.type === "tool-navigate" ||
								p.type === "tool-configureReport") &&
							p.state === "output-available" &&
							typeof p.toolCallId === "string"
					)
			);
		// First non-loading snapshot is thread history — record, don't replay.
		if (seenClientToolCallsRef.current === null) {
			seenClientToolCallsRef.current = new Set(
				messageParts.flat().map((p) => p.toolCallId as string)
			);
			return;
		}
		for (const parts of messageParts) {
			// A turn that configured the open builder must never also yank the
			// user off it — belt-and-braces on top of the instruction layer.
			const configuredBuilder = parts.some(
				(p) =>
					p.type === "tool-configureReport" &&
					(p.output as { ok?: boolean })?.ok === true
			);
			for (const part of parts) {
				const id = part.toolCallId as string;
				if (seenClientToolCallsRef.current.has(id)) continue;
				seenClientToolCallsRef.current.add(id);
				if (part.type === "tool-navigate") {
					const output = part.output as { ok?: boolean; path?: string };
					if (
						!configuredBuilder &&
						output?.ok &&
						typeof output.path === "string" &&
						output.path.startsWith("/") &&
						!output.path.startsWith("//")
					) {
						router.push(output.path);
					}
				} else {
					const output = part.output as {
						ok?: boolean;
						config?: BuilderReportConfig;
					};
					if (output?.ok && output.config) {
						applyReportConfig(output.config);
					}
				}
			}
		}
	}, [messages.results, messages.status, router, applyReportConfig]);

	const handleSend = async (promptOverride?: string) => {
		const prompt = (promptOverride ?? input).trim();
		if (!prompt || isResponding) return;
		setInput("");
		setIsResponding(true);
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
				({ messageId } = await sendMessage({ threadId: tid, prompt }));
				pendingRetryRef.current = { threadId: tid, prompt, messageId };
			}
			await streamResponse({
				threadId: tid,
				promptMessageId: messageId,
				screenContext: getScreenContext(),
			});
			pendingRetryRef.current = null;
		} catch {
			// Restore the failed prompt, but never clobber a newer draft.
			setInput((current) => (current.trim() ? current : prompt));
			toast.error("The assistant hit a snag", "Please try that again.");
		} finally {
			setIsResponding(false);
		}
	};

	const startNewChat = () => {
		setThreadId(null);
		setShowHistory(false);
		seenClientToolCallsRef.current = null;
	};

	const content = (
		<>
					<div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
						<div>
							<h2 className="flex items-center gap-2 text-base font-semibold">
								<Sparkles className="size-4 text-primary" />
								Assistant
							</h2>
							<p className="text-xs text-muted-foreground">
								Ask about your clients, schedule, quotes, invoices, and more
							</p>
						</div>
						<div className="flex items-center gap-1">
							{!locked && (
								<>
									<HeaderButton
										onClick={() => setShowHistory((v) => !v)}
										label="Conversation history"
										active={showHistory}
									>
										<History className="size-4" />
									</HeaderButton>
									<HeaderButton
										onClick={startNewChat}
										label="New conversation"
									>
										<MessageSquarePlus className="size-4" />
									</HeaderButton>
								</>
							)}
							<HeaderButton
								onClick={onTogglePin}
								label={
									pinned ? "Unpin assistant" : "Pin assistant to the side"
								}
								active={pinned}
								className="hidden md:inline-flex"
							>
								{pinned ? (
									<PinOff className="size-4" />
								) : (
									<Pin className="size-4" />
								)}
							</HeaderButton>
							<HeaderButton
								onClick={() => onOpenChange(false)}
								label="Close assistant"
							>
								<X className="size-4" />
							</HeaderButton>
						</div>
					</div>

					{locked && <UpgradePrompt />}

					{!locked && (
						<ContextBanner
							record={currentRecord}
							builderMounted={builderMounted}
						/>
					)}

					{!locked && (showHistory ? (
						<div className="flex-1 overflow-y-auto p-2">
							{threads === undefined ? (
								<div className="flex justify-center py-8">
									<Loader2 className="size-5 animate-spin text-muted-foreground" />
								</div>
							) : threads.length === 0 ? (
								<p className="py-8 text-center text-sm text-muted-foreground">
									No conversations yet
								</p>
							) : (
								threads.map((t) => (
									<button
										key={t.threadId}
										type="button"
										onClick={() => {
											setThreadId(t.threadId);
											setShowHistory(false);
											// Historical thread: seed the baseline from its first
											// snapshot so past tool effects never replay.
											seenClientToolCallsRef.current = null;
										}}
										className={cn(
											"w-full cursor-pointer rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-foreground/[0.04]",
											t.threadId === threadId && "bg-foreground/[0.06]"
										)}
									>
										<span className="line-clamp-1">{t.title}</span>
										<span className="text-xs text-muted-foreground">
											{new Date(t.lastMessageAt).toLocaleDateString(undefined, {
												month: "short",
												day: "numeric",
											})}
										</span>
									</button>
								))
							)}
						</div>
					) : (
						<div className="flex-1 overflow-y-auto px-4 py-4">
							{!threadId || messageCount === 0 ? (
								<div className="flex h-full flex-col items-center justify-center gap-4">
									<div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10">
										<Sparkles className="size-6 text-primary" />
									</div>
									<p className="max-w-xs text-center text-sm text-muted-foreground">
										Ask anything about your business — I can look at live data
										across your whole workspace.
									</p>
									<div className="flex w-full max-w-sm flex-col gap-2">
										{suggestionsFor(builderMounted, currentRecord).map((s) => (
											<button
												key={s}
												type="button"
												onClick={() => void handleSend(s)}
												disabled={isResponding}
												className="cursor-pointer rounded-xl border border-border px-3.5 py-2.5 text-left text-sm text-foreground/80 transition-colors hover:border-primary/40 hover:bg-primary/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
											>
												{s}
											</button>
										))}
									</div>
								</div>
							) : (
								<div className="flex flex-col gap-4">
									{messages.results.map((message) => (
										<MessageItem key={message.key} message={message} />
									))}
									{showThinking && (
										<div className="flex items-center gap-2 text-sm text-muted-foreground">
											<Loader2 className="size-3.5 animate-spin" />
											Thinking…
										</div>
									)}
									<div ref={bottomRef} />
								</div>
							)}
						</div>
					))}

					{!locked && !showHistory && (
						<div className="shrink-0 border-t border-border p-3">
							<div className="flex items-end gap-2 rounded-xl border border-border bg-muted/30 p-2 focus-within:border-primary/40">
								<Textarea
									value={input}
									onChange={(e) => setInput(e.target.value)}
									onKeyDown={(e) => {
										if (
											e.key === "Enter" &&
											!e.shiftKey &&
											!e.nativeEvent.isComposing
										) {
											e.preventDefault();
											void handleSend();
										}
									}}
									placeholder="Ask about your business…"
									rows={1}
									maxLength={4000}
									autoFocus
									className="max-h-32 min-h-9 flex-1 resize-none border-0 bg-transparent p-1.5 text-sm shadow-none focus-visible:ring-0"
								/>
								<button
									type="button"
									onClick={() => void handleSend()}
									disabled={!input.trim() || isResponding}
									className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
									aria-label="Send message"
								>
									<ArrowUp className="size-4" />
								</button>
							</div>
							<p className="mt-1.5 text-center text-[11px] text-muted-foreground">
								The assistant can make changes you ask for — double-check
								anything important.
							</p>
						</div>
					)}
		</>
	);

	// Docked: an in-flow flex child of the sidebar wrapper — same tree slot
	// as the floating variant, so thread state survives pin toggles.
	if (docked) {
		return open ? (
			<div
				role="dialog"
				aria-label="Assistant chat"
				className="relative z-40 my-2 mr-2 hidden w-[26rem] shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-sm md:flex md:h-[calc(100svh-1rem)]"
			>
				{content}
			</div>
		) : null;
	}

	return (
		<AnimatePresence>
			{open && (
				<motion.div
					key="assistant-panel"
					role="dialog"
					aria-label="Assistant chat"
					initial={{ y: "110%" }}
					animate={{ y: 0 }}
					exit={{ y: "110%" }}
					transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
					className="fixed inset-x-0 bottom-0 z-50 flex h-[min(85dvh,640px)] flex-col overflow-hidden rounded-t-2xl border border-border bg-background shadow-2xl sm:inset-x-auto sm:right-4 sm:bottom-2 sm:w-[30rem] sm:max-w-[calc(100vw-2rem)] sm:rounded-2xl"
				>
					{content}
				</motion.div>
			)}
		</AnimatePresence>
	);
}
