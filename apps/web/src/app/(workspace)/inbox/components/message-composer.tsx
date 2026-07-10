"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LinkClientPopover } from "./link-client-popover";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";

interface MessageComposerProps {
	/** When false, the thread is unlinked and replies are blocked. */
	canReply: boolean;
	isSending: boolean;
	/** Resolves true when the reply was sent; the draft is cleared only then. */
	onSend: (body: string) => Promise<boolean>;
	onLinkClient: (clientId: Id<"clients">) => void;
}

const MAX_TEXTAREA_HEIGHT = 200;

export function MessageComposer({
	canReply,
	isSending,
	onSend,
	onLinkClient,
}: MessageComposerProps) {
	const [value, setValue] = useState("");
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	// Auto-grow the textarea up to a cap, then let it scroll internally.
	useLayoutEffect(() => {
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
	}, [value]);

	const trimmed = value.trim();
	const canSend = canReply && trimmed.length > 0 && !isSending;

	const handleSend = async () => {
		if (!canSend) return;
		const ok = await onSend(trimmed);
		if (ok) setValue("");
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		// Cmd/Ctrl+Enter sends; plain Enter inserts a newline.
		if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
			e.preventDefault();
			void handleSend();
		}
	};

	if (!canReply) {
		return (
			<div className="shrink-0 border-t border-border bg-muted/20 p-4">
				<div className="flex flex-col items-start gap-2 text-sm text-muted-foreground">
					<p>Link this conversation to a client to reply.</p>
					<LinkClientPopover onSelect={onLinkClient} />
				</div>
			</div>
		);
	}

	return (
		<div className="shrink-0 border-t border-border bg-background p-3">
			<div className="flex items-end gap-2 rounded-lg border border-border bg-background p-2 transition-colors duration-150 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20">
				<textarea
					ref={textareaRef}
					value={value}
					onChange={(e) => setValue(e.target.value)}
					onKeyDown={handleKeyDown}
					rows={1}
					placeholder="Reply…"
					aria-label="Reply message"
					className="max-h-[200px] min-h-9 flex-1 resize-none bg-transparent px-1.5 py-1.5 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
				/>
				<Button
					size="sm"
					onClick={handleSend}
					disabled={!canSend || isSending}
				>
					{isSending ? (
						<Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
					) : (
						<Send className="h-4 w-4" aria-hidden="true" />
					)}
					Send
				</Button>
			</div>
		</div>
	);
}
