"use client";

import { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { StyledButton } from "@/components/ui/styled/styled-button";
import { MentionSection } from "@/components/shared/mention-section";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useRef } from "react";
import { Settings, ClipboardList, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";

function formatCurrency(amount: number) {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(amount);
}

interface OverviewTabProps {
	quote: Doc<"quotes">;
	quoteId: Id<"quotes">;
	lineItems: Doc<"quoteLineItems">[] | undefined;
}

export function OverviewTab({ quote, quoteId, lineItems }: OverviewTabProps) {
	const router = useRouter();
	const toast = useToast();
	const updateQuote = useMutation(api.quotes.update);

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
		setTermsValue(quote.terms || "");
		setIsEditingTerms(true);
	};

	const cancelEditingTerms = () => {
		setIsEditingTerms(false);
		setTermsValue("");
	};

	const saveTerms = async () => {
		try {
			await updateQuote({ id: quoteId, terms: termsValue || undefined });
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
		setMessageValue(quote.clientMessage || "");
		setIsEditingMessage(true);
	};

	const cancelEditingMessage = () => {
		setIsEditingMessage(false);
		setMessageValue("");
	};

	const saveMessage = async () => {
		try {
			await updateQuote({ id: quoteId, clientMessage: messageValue || undefined });
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
			{/* Line Items Section */}
			<div>
				<div className="flex items-center justify-between mb-1 min-h-8">
					<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
						Line Items
					</h3>
					<StyledButton
						intent="outline"
						size="sm"
						onClick={() =>
							router.push(`/quotes/${quoteId}/quoteLineEditor`)
						}
						icon={<Settings className="h-4 w-4" />}
						label="Edit Line Items"
						showArrow={false}
					/>
				</div>
				<Separator className="mb-4" />

				{lineItems && lineItems.length > 0 ? (
					<>
						<div className="overflow-hidden rounded-lg border">
							<Table>
								<TableHeader className="bg-muted">
									<TableRow>
										<TableHead>Description</TableHead>
										<TableHead className="text-center">
											Qty
										</TableHead>
										<TableHead className="text-center">
											Unit
										</TableHead>
										<TableHead className="text-right">
											Rate
										</TableHead>
										<TableHead className="text-right">
											Amount
										</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{lineItems.map((item) => (
										<TableRow key={item._id}>
											<TableCell className="font-medium">
												{item.description}
											</TableCell>
											<TableCell className="text-center">
												{item.quantity}
											</TableCell>
											<TableCell className="text-center">
												{item.unit || "item"}
											</TableCell>
											<TableCell className="text-right">
												{formatCurrency(item.rate)}
											</TableCell>
											<TableCell className="text-right font-medium">
												{formatCurrency(item.amount)}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>

						{/* Totals */}
						<div className="mt-6 space-y-2">
							<div className="flex justify-between text-sm">
								<span className="text-muted-foreground">
									Subtotal:
								</span>
								<span className="font-medium">
									{formatCurrency(quote.subtotal)}
								</span>
							</div>
							{quote.discountEnabled &&
								quote.discountAmount && (
									<div className="flex justify-between text-sm">
										<span className="text-muted-foreground">
											Discount:
										</span>
										<span className="font-medium text-red-600 dark:text-red-400">
											-
											{quote.discountType === "percentage"
												? `${quote.discountAmount}%`
												: formatCurrency(
														quote.discountAmount
													)}
										</span>
									</div>
								)}
							{quote.taxEnabled && quote.taxAmount && (
								<div className="flex justify-between text-sm">
									<span className="text-muted-foreground">
										Tax:
									</span>
									<span className="font-medium">
										{formatCurrency(quote.taxAmount)}
									</span>
								</div>
							)}
							<div className="border-t pt-2">
								<div className="flex justify-between text-lg font-bold">
									<span>Total:</span>
									<span>{formatCurrency(quote.total)}</span>
								</div>
							</div>
						</div>
					</>
				) : (
					<div className="flex flex-col items-center justify-center py-12 text-center">
						<div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center mb-3">
							<ClipboardList className="h-6 w-6 text-muted-foreground" />
						</div>
						<p className="text-sm text-muted-foreground">
							No line items added yet
						</p>
					</div>
				)}
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
