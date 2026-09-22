import { useEffect, useRef, useState, type RefObject } from "react";
import { MessageSquareQuote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Below this much room above the selection the pill flips under the line.
const HEADROOM = 40;
// Keeps the pill's own width inside the panel at either end of a line.
const INSET = 56;
// A one-word selection is almost always an accident, not a quote.
const MIN_QUOTE = 8;

type Anchor = { x: number; y: number; below: boolean; text: string };

/** Select text inside an assistant answer (`[data-answer-body]`) to reply to
 *  that line. Positioned inside `host`, so a scroll moves or clears it. */
export function QuoteReplyPill({
	host,
	onQuote,
}: {
	host: RefObject<HTMLDivElement | null>;
	onQuote: (quote: string) => void;
}) {
	const rangeRef = useRef<Range | null>(null);
	const [anchor, setAnchor] = useState<Anchor | null>(null);

	useEffect(() => {
		const box = host.current;
		if (!box) return;

		function measure(range: Range) {
			if (!box) return null;
			const rect = range.getBoundingClientRect();
			const frame = box.getBoundingClientRect();
			if (!rect.width && !rect.height) return null;
			if (rect.bottom < frame.top || rect.top > frame.bottom) return null;
			const below = rect.top - frame.top < HEADROOM;
			const limit = Math.max(INSET, frame.width - INSET);
			return {
				x: Math.min(
					Math.max(rect.left + rect.width / 2 - frame.left, INSET),
					limit
				),
				y: (below ? rect.bottom : rect.top) - frame.top,
				below,
			};
		}

		function clear() {
			rangeRef.current = null;
			setAnchor(null);
		}

		function onSelectionChange() {
			const selection = document.getSelection();
			if (!box || !selection || selection.isCollapsed) return clear();
			const node = selection.anchorNode;
			const element =
				node?.nodeType === Node.ELEMENT_NODE
					? (node as Element)
					: node?.parentElement;
			const body = element?.closest("[data-answer-body]");
			const text = selection.toString().trim();
			if (!body || !box.contains(body) || text.length < MIN_QUOTE) {
				return clear();
			}
			const range = selection.getRangeAt(0);
			rangeRef.current = range;
			const spot = measure(range);
			setAnchor(spot ? { ...spot, text } : null);
		}

		function reposition() {
			const range = rangeRef.current;
			if (!range) return;
			const spot = measure(range);
			setAnchor((current) =>
				current && spot ? { ...current, ...spot } : null
			);
		}

		// scroll doesn't bubble — listen on the scrolling viewport itself.
		const viewport = box.querySelector(
			"[data-slot=message-scroller-viewport]"
		);
		document.addEventListener("selectionchange", onSelectionChange);
		viewport?.addEventListener("scroll", reposition, { passive: true });
		window.addEventListener("resize", clear);
		return () => {
			document.removeEventListener("selectionchange", onSelectionChange);
			viewport?.removeEventListener("scroll", reposition);
			window.removeEventListener("resize", clear);
		};
	}, [host]);

	if (!anchor) return null;

	return (
		<Button
			size="sm"
			// Keep the selection alive through the click.
			onMouseDown={(e) => e.preventDefault()}
			onClick={() => {
				onQuote(anchor.text);
				document.getSelection()?.removeAllRanges();
			}}
			style={{ left: anchor.x, top: anchor.y }}
			className={cn(
				"absolute z-10 h-7 -translate-x-1/2 gap-1.5 rounded-full px-2.5 text-xs shadow-md",
				anchor.below ? "translate-y-2" : "-translate-y-[calc(100%+0.5rem)]"
			)}
		>
			<MessageSquareQuote className="size-3.5" aria-hidden />
			Reply
		</Button>
	);
}
