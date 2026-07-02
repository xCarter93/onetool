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
	Sparkles,
	X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
	ToolPartRenderer,
	type AssistantToolPart,
} from "./renderers";
import { useCurrentRecord } from "./use-current-record";
import { useScreenContext } from "./use-screen-context";

const SUGGESTIONS = [
	"What's on the schedule this week?",
	"Chart revenue by month this year",
	"Which invoices are overdue?",
	"Any quotes waiting on approval?",
];

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

/** "The page you're on is shared with the assistant" strip for record pages. */
function RecordContextBanner() {
	const record = useCurrentRecord();
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
	children,
}: {
	onClick: () => void;
	label: string;
	active?: boolean;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"inline-flex cursor-pointer items-center justify-center rounded-lg p-2 text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground",
				active && "bg-foreground/[0.08] text-foreground"
			)}
			aria-label={label}
		>
			{children}
		</button>
	);
}

interface AssistantPanelProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function AssistantPanel({ open, onOpenChange }: AssistantPanelProps) {
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
	// navigate tool calls already executed. null = "seed from the next
	// snapshot without navigating" (set when opening a historical thread);
	// a fresh empty Set (set at thread creation) means navigate immediately —
	// a brand-new thread has no history that could replay.
	const seenNavigationsRef = useRef<Set<string> | null>(null);

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

	useEffect(() => {
		if (!open) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") onOpenChange(false);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [open, onOpenChange]);

	// Client-executed navigate tool: the server only validates the path; the
	// actual routing happens here when a new tool result streams in.
	useEffect(() => {
		if (messages.status === "LoadingFirstPage" || !messages.results) return;
		const navParts = messages.results
			.filter((m) => m.role === "assistant")
			.flatMap((m) => m.parts)
			.map((p) => p as unknown as AssistantToolPart)
			.filter(
				(p) =>
					p.type === "tool-navigate" &&
					p.state === "output-available" &&
					typeof p.toolCallId === "string"
			);
		// First non-loading snapshot is thread history — record, don't replay.
		if (seenNavigationsRef.current === null) {
			seenNavigationsRef.current = new Set(
				navParts.map((p) => p.toolCallId as string)
			);
			return;
		}
		for (const part of navParts) {
			const id = part.toolCallId as string;
			if (seenNavigationsRef.current.has(id)) continue;
			seenNavigationsRef.current.add(id);
			const output = part.output as { ok?: boolean; path?: string };
			if (
				output?.ok &&
				typeof output.path === "string" &&
				output.path.startsWith("/") &&
				!output.path.startsWith("//")
			) {
				router.push(output.path);
			}
		}
	}, [messages.results, messages.status, router]);

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
				// New thread has no history — navigate calls can run right away.
				seenNavigationsRef.current = new Set();
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
		seenNavigationsRef.current = null;
	};

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
							<HeaderButton
								onClick={() => setShowHistory((v) => !v)}
								label="Conversation history"
								active={showHistory}
							>
								<History className="size-4" />
							</HeaderButton>
							<HeaderButton onClick={startNewChat} label="New conversation">
								<MessageSquarePlus className="size-4" />
							</HeaderButton>
							<HeaderButton
								onClick={() => onOpenChange(false)}
								label="Close assistant"
							>
								<X className="size-4" />
							</HeaderButton>
						</div>
					</div>

					<RecordContextBanner />

					{showHistory ? (
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
											// snapshot so past navigations never replay.
											seenNavigationsRef.current = null;
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
										{SUGGESTIONS.map((s) => (
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
									{isResponding &&
										messages.results[messages.results.length - 1]?.role ===
											"user" && (
											<div className="flex items-center gap-2 text-sm text-muted-foreground">
												<Loader2 className="size-3.5 animate-spin" />
												Thinking…
											</div>
										)}
									<div ref={bottomRef} />
								</div>
							)}
						</div>
					)}

					{!showHistory && (
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
								Read-only for now — the assistant can look things up but not
								change them.
							</p>
						</div>
					)}
				</motion.div>
			)}
		</AnimatePresence>
	);
}
