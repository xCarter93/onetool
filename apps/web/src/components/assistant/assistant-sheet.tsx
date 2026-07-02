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
	History,
	Loader2,
	MessageSquarePlus,
	Sparkles,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const TOOL_LABELS: Record<string, string> = {
	getSchedule: "Checked the schedule",
	getTasks: "Looked up tasks",
	getBusinessStats: "Pulled business stats",
	runReport: "Ran a report",
	listClients: "Looked up clients",
	getClient: "Fetched client details",
	listProjects: "Looked up projects",
	getProject: "Fetched project details",
	listQuotes: "Looked up quotes",
	getQuote: "Fetched quote details",
	listInvoices: "Looked up invoices",
	getInvoice: "Fetched invoice details",
	searchClientEmails: "Searched emails",
	getEmailThread: "Read an email thread",
	getDocuments: "Looked up documents",
	getActivity: "Checked recent activity",
};

const SUGGESTIONS = [
	"What's on the schedule this week?",
	"How is revenue tracking this month?",
	"Which invoices are overdue?",
	"Any quotes waiting on approval?",
];

function ToolChip({ partType }: { partType: string }) {
	const name = partType.replace(/^tool-/, "");
	return (
		<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
			<Sparkles className="size-3" />
			{TOOL_LABELS[name] ?? `Used ${name}`}
		</div>
	);
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
					return <ToolChip key={i} partType={part.type} />;
				}
				return null;
			})}
		</div>
	);
}

interface AssistantSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function AssistantSheet({ open, onOpenChange }: AssistantSheetProps) {
	const [threadId, setThreadId] = useState<string | null>(null);
	const [showHistory, setShowHistory] = useState(false);
	const [input, setInput] = useState("");
	const [isResponding, setIsResponding] = useState(false);
	const bottomRef = useRef<HTMLDivElement>(null);
	const toast = useToast();

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
			}
			const { messageId } = await sendMessage({ threadId: tid, prompt });
			await streamResponse({ threadId: tid, promptMessageId: messageId });
		} catch {
			setInput(prompt);
			toast.error("The assistant hit a snag", "Please try that again.");
		} finally {
			setIsResponding(false);
		}
	};

	const startNewChat = () => {
		setThreadId(null);
		setShowHistory(false);
	};

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				className="flex w-full flex-col gap-0 bg-background p-0 sm:max-w-lg"
			>
				<SheetHeader className="shrink-0 border-b border-border px-4 py-3">
					<div className="flex items-center justify-between pr-8">
						<div>
							<SheetTitle className="flex items-center gap-2 text-base">
								<Sparkles className="size-4 text-primary" />
								Assistant
							</SheetTitle>
							<SheetDescription className="text-xs">
								Ask about your clients, schedule, quotes, invoices, and more
							</SheetDescription>
						</div>
						<div className="flex items-center gap-1">
							<button
								type="button"
								onClick={() => setShowHistory((v) => !v)}
								className={cn(
									"inline-flex cursor-pointer items-center justify-center rounded-lg p-2 text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground",
									showHistory && "bg-foreground/[0.08] text-foreground"
								)}
								aria-label="Conversation history"
							>
								<History className="size-4" />
							</button>
							<button
								type="button"
								onClick={startNewChat}
								className="inline-flex cursor-pointer items-center justify-center rounded-lg p-2 text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
								aria-label="New conversation"
							>
								<MessageSquarePlus className="size-4" />
							</button>
						</div>
					</div>
				</SheetHeader>

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
			</SheetContent>
		</Sheet>
	);
}
