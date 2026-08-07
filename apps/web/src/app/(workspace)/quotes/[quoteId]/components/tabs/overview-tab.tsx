"use client";

import { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { MentionSection } from "@/components/shared/mention-section";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Eye, Pencil } from "lucide-react";
import {
	Frame,
	FrameFooter,
	FrameHeader,
	FramePanel,
	FrameTitle,
} from "@/components/reui/frame";
import {
	LineItemGrid,
	LineItemGridHints,
} from "@/components/shared/line-items/line-item-grid";
import { LineItemsTotals } from "@/components/shared/line-items/line-items-totals";
import { PricingFooter } from "@/components/shared/line-items/pricing-footer";
import { SaveStateIndicator } from "@/components/shared/line-items/save-state-indicator";
import { useQuoteLineItemsController } from "@/components/shared/line-items/use-quote-line-items-controller";
import {
	computeDisplayTotals,
	type LineItemsPricingSettings,
} from "@/components/shared/line-items/types";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

interface OverviewTabProps {
	quote: Doc<"quotes">;
	quoteId: Id<"quotes">;
	lineItems: Doc<"quoteLineItems">[] | undefined;
	onPreviewPdf: () => void;
	/** True while the quote has nothing to render (loading or no line items). */
	previewDisabled: boolean;
}

export function OverviewTab({
	quote,
	quoteId,
	lineItems,
	onPreviewPdf,
	previewDisabled,
}: OverviewTabProps) {
	const toast = useToast();
	const updateQuote = useMutation(api.quotes.update);
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();

	// The new-quote dialog hands the caret over with ?focus=line-items. Latch it
	// on mount so stripping the param below can't un-flip the grid's prop, and
	// so a refresh of the clean URL never re-triggers the focus.
	const [autoFocusLineItems] = useState(
		() => searchParams.get("focus") === "line-items"
	);
	const focusParamClearedRef = useRef(false);

	useEffect(() => {
		if (!autoFocusLineItems || focusParamClearedRef.current) return;
		focusParamClearedRef.current = true;
		// Strip only `focus`, so any other param on the URL survives.
		const next = new URLSearchParams(searchParams.toString());
		next.delete("focus");
		const query = next.toString();
		router.replace(query ? `${pathname}?${query}` : pathname, {
			scroll: false,
		});
	}, [autoFocusLineItems, pathname, router, searchParams]);

	const controller = useQuoteLineItemsController({
		quote,
		quoteId,
		lineItems,
	});

	// Display-only math. The server recomputes and stores subtotal/total from
	// the line items — never send computed totals back.
	const pricing: LineItemsPricingSettings = useMemo(
		() => ({
			discountAmount: quote.discountEnabled ? (quote.discountAmount ?? 0) : 0,
			discountType: quote.discountType ?? "fixed",
			taxRate: quote.taxEnabled ? (quote.taxRate ?? 0) : 0,
			pdfSettings: {
				showQuantities: quote.pdfSettings?.showQuantities ?? true,
				showUnitPrices: quote.pdfSettings?.showUnitPrices ?? true,
				showLineItemTotals: quote.pdfSettings?.showLineItemTotals ?? true,
				showTotals: quote.pdfSettings?.showTotals ?? true,
			},
		}),
		[
			quote.discountEnabled,
			quote.discountAmount,
			quote.discountType,
			quote.taxEnabled,
			quote.taxRate,
			quote.pdfSettings,
		]
	);

	const subtotal = useMemo(
		() => controller.items.reduce((sum, item) => sum + item.quantity * item.rate, 0),
		[controller.items]
	);
	const totalCost = useMemo(
		() =>
			controller.items.reduce(
				(sum, item) => sum + item.quantity * (item.cost ?? 0),
				0
			),
		[controller.items]
	);
	const totals = computeDisplayTotals(subtotal, pricing);

	const savePricing = useCallback(
		async (next: LineItemsPricingSettings) => {
			try {
				await updateQuote({
					id: quoteId,
					discountEnabled: next.discountAmount > 0,
					discountAmount: next.discountAmount,
					discountType: next.discountType,
					taxEnabled: next.taxRate > 0,
					taxRate: next.taxRate,
					pdfSettings: next.pdfSettings,
				});
			} catch (err) {
				const message = err instanceof Error ? err.message : "Failed to save";
				toast.error("Error", message);
			}
		},
		[quoteId, toast, updateQuote]
	);

	// Inline editing for terms
	const [isEditingTerms, setIsEditingTerms] = useState(false);
	const [termsValue, setTermsValue] = useState("");
	const termsRef = useRef<HTMLTextAreaElement>(null);

	// Inline editing for client message
	const [isEditingMessage, setIsEditingMessage] = useState(false);
	const [messageValue, setMessageValue] = useState("");
	const messageRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		if (isEditingTerms && termsRef.current) {
			termsRef.current.focus();
			termsRef.current.selectionStart = termsRef.current.value.length;
		}
	}, [isEditingTerms]);

	useEffect(() => {
		if (isEditingMessage && messageRef.current) {
			messageRef.current.focus();
			messageRef.current.selectionStart = messageRef.current.value.length;
		}
	}, [isEditingMessage]);

	const startEditingTerms = () => {
		// Terms are gated server-side once the quote locks; don't open a dead editor.
		if (controller.locked) return;
		setTermsValue(quote.terms || "");
		setIsEditingTerms(true);
	};

	const cancelEditingTerms = () => {
		setIsEditingTerms(false);
		setTermsValue("");
	};

	const saveTerms = async () => {
		try {
			// Send "" rather than undefined: undefined is stripped server-side and an
			// empty payload throws "No valid updates provided", so clearing never saved.
			await updateQuote({ id: quoteId, terms: termsValue });
			toast.success("Updated", "Terms saved.");
			cancelEditingTerms();
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to save";
			toast.error("Error", message);
		}
	};

	const handleTermsKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			saveTerms();
		}
		if (e.key === "Escape") {
			cancelEditingTerms();
		}
	};

	const startEditingMessage = () => {
		if (controller.locked) return;
		setMessageValue(quote.clientMessage || "");
		setIsEditingMessage(true);
	};

	const cancelEditingMessage = () => {
		setIsEditingMessage(false);
		setMessageValue("");
	};

	const saveMessage = async () => {
		try {
			// See saveTerms: "" is a valid update, undefined degenerates to an empty payload.
			await updateQuote({ id: quoteId, clientMessage: messageValue });
			toast.success("Updated", "Client message saved.");
			cancelEditingMessage();
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to save";
			toast.error("Error", message);
		}
	};

	const handleMessageKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			saveMessage();
		}
		if (e.key === "Escape") {
			cancelEditingMessage();
		}
	};

	return (
		<div className="space-y-8">
			{/* Line Items */}
			<div className="space-y-3">
				{!controller.locked && <LineItemGridHints />}

				<Frame dense spacing="sm">
					<FrameHeader className="flex-row items-center justify-between gap-3">
						<FrameTitle>Line Items</FrameTitle>
						<div className="flex items-center gap-2.5">
							<SaveStateIndicator state={controller.saveState} />
							<Tooltip>
								<TooltipTrigger
									render={
										<span
											// A disabled button swallows pointer events, so the
											// tooltip needs a live wrapper to hang off.
											tabIndex={previewDisabled ? 0 : -1}
											className="inline-flex rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
										/>
									}
								>
									<Button
										variant="outline"
										size="sm"
										disabled={previewDisabled}
										onClick={onPreviewPdf}
									>
										<Eye className="h-4 w-4" aria-hidden="true" />
										Preview Document
									</Button>
								</TooltipTrigger>
								{previewDisabled && (
									<TooltipContent>
										Add a line item to preview this quote
									</TooltipContent>
								)}
							</Tooltip>
						</div>
					</FrameHeader>

					<FramePanel className="px-0 py-0">
						<LineItemGrid
							bare
							showHints={false}
							controller={controller}
							isLoading={lineItems === undefined}
							autoFocusFirstRow={autoFocusLineItems}
						/>
					</FramePanel>

					<FrameFooter>
						<PricingFooter
							value={pricing}
							onSave={savePricing}
							disabled={controller.locked}
						/>
					</FrameFooter>
				</Frame>

				<LineItemsTotals
					subtotal={totals.subtotal}
					discountAmount={totals.discountAmount}
					taxAmount={totals.taxAmount}
					total={totals.total}
					showCostMargin={controller.showCostMargin}
					totalCost={totalCost}
					className="mt-0"
				/>
			</div>

			{/* Terms & Client Message Section */}
			<div>
				<div className="flex items-center justify-between mb-1 min-h-8">
					<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
						Terms & Client Message
					</h3>
				</div>
				<Separator className="mb-4" />

				{/* Terms — click to edit */}
				<div
					className="text-sm rounded-md -mx-2 px-2 py-2 transition-colors group cursor-pointer hover:bg-muted/50"
					onClick={() => !isEditingTerms && startEditingTerms()}
				>
					<span className="text-muted-foreground">Terms & Conditions</span>
					{isEditingTerms ? (
						<div className="mt-1" onClick={(e) => e.stopPropagation()}>
							<textarea
								ref={termsRef}
								value={termsValue}
								onChange={(e) => setTermsValue(e.target.value)}
								onKeyDown={handleTermsKeyDown}
								rows={3}
								className="w-full text-sm rounded-md border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
								placeholder="Add terms & conditions..."
							/>
							<div className="flex items-center justify-between mt-1.5">
								<span className="text-xs text-muted-foreground">Enter to save, Shift+Enter for new line, Esc to cancel</span>
								<div className="flex items-center gap-1">
									<button
										onClick={saveTerms}
										className="text-xs font-medium text-primary hover:text-primary/80 transition-colors px-2 py-1 rounded-md hover:bg-primary/10"
									>
										Save
									</button>
									<button
										onClick={cancelEditingTerms}
										className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted"
									>
										Cancel
									</button>
								</div>
							</div>
						</div>
					) : (
						<div className="flex items-start gap-2 mt-1">
							<div className="flex-1 min-w-0">
								{quote.terms ? (
									<p className="text-foreground font-medium whitespace-pre-wrap">{quote.terms}</p>
								) : (
									<p className="text-muted-foreground italic">Add terms & conditions...</p>
								)}
							</div>
							<Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
						</div>
					)}
				</div>

				{/* Client Message — click to edit */}
				<div
					className="text-sm rounded-md -mx-2 px-2 py-2 transition-colors group cursor-pointer hover:bg-muted/50"
					onClick={() => !isEditingMessage && startEditingMessage()}
				>
					<span className="text-muted-foreground">Message to Client</span>
					{isEditingMessage ? (
						<div className="mt-1" onClick={(e) => e.stopPropagation()}>
							<textarea
								ref={messageRef}
								value={messageValue}
								onChange={(e) => setMessageValue(e.target.value)}
								onKeyDown={handleMessageKeyDown}
								rows={3}
								className="w-full text-sm rounded-md border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
								placeholder="Add a message to the client..."
							/>
							<div className="flex items-center justify-between mt-1.5">
								<span className="text-xs text-muted-foreground">Enter to save, Shift+Enter for new line, Esc to cancel</span>
								<div className="flex items-center gap-1">
									<button
										onClick={saveMessage}
										className="text-xs font-medium text-primary hover:text-primary/80 transition-colors px-2 py-1 rounded-md hover:bg-primary/10"
									>
										Save
									</button>
									<button
										onClick={cancelEditingMessage}
										className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted"
									>
										Cancel
									</button>
								</div>
							</div>
						</div>
					) : (
						<div className="flex items-start gap-2 mt-1">
							<div className="flex-1 min-w-0">
								{quote.clientMessage ? (
									<p className="text-foreground font-medium whitespace-pre-wrap">{quote.clientMessage}</p>
								) : (
									<p className="text-muted-foreground italic">Add a message to the client...</p>
								)}
							</div>
							<Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
						</div>
					)}
				</div>
			</div>

			{/* Team Communication Section */}
			<div>
				<div className="flex items-center justify-between mb-1 min-h-8">
					<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
						Team Communication
					</h3>
				</div>
				<Separator className="mb-4" />

				<MentionSection
					entityType="quote"
					entityId={quoteId}
					entityName={
						quote?.title ||
						`Quote #${quote?.quoteNumber || quoteId.slice(-6)}`
					}
					hideCardWrapper
				/>
			</div>
		</div>
	);
}
