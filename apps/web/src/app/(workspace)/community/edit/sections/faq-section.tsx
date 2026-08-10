"use client";

import React from "react";
import { HelpCircle, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SectionShell } from "./section-shell";
import {
	MAX_FAQ_ANSWER_LENGTH,
	MAX_FAQ_ITEMS,
	MAX_FAQ_QUESTION_LENGTH,
	type FaqItem,
} from "../use-community-page-form";

interface FaqSectionProps {
	faqItems: FaqItem[];
	setFaqItems: React.Dispatch<React.SetStateAction<FaqItem[]>>;
	sectionRef: (el: HTMLElement | null) => void;
}

export const FaqSection = React.memo(function FaqSection({
	faqItems,
	setFaqItems,
	sectionRef,
}: FaqSectionProps) {
	const update = (index: number, patch: Partial<FaqItem>) => {
		setFaqItems((prev) =>
			prev.map((item, i) => (i === index ? { ...item, ...patch } : item)),
		);
	};

	return (
		<SectionShell
			id="faq"
			sectionRef={sectionRef}
			icon={HelpCircle}
			title="Common Questions"
			description="Answer what people ask on the phone and they stop having to call to find out."
			headerAccessory={
				faqItems.length > 0 ? (
					<span className="shrink-0 text-xs tabular-nums text-muted-fg">
						{faqItems.length} of {MAX_FAQ_ITEMS}
					</span>
				) : undefined
			}
		>
			{faqItems.length === 0 && (
				<p className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-fg">
					No questions yet. Add the three you answer most often.
				</p>
			)}

			<div className="space-y-4">
				{faqItems.map((item, index) => (
					<div
						key={index}
						className="overflow-hidden rounded-xl border border-border/60 bg-background transition-colors hover:border-border"
					>
						<div className="flex items-center justify-between border-b border-border/40 bg-muted/30 px-4 py-3">
							<div className="flex min-w-0 items-center gap-3">
								<span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
									{index + 1}
								</span>
								<span className="truncate text-sm font-medium text-fg">
									{item.question || "Untitled question"}
								</span>
							</div>
							<button
								type="button"
								aria-label={`Remove question ${index + 1}`}
								onClick={() =>
									setFaqItems((prev) => prev.filter((_, i) => i !== index))
								}
								className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted-fg transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
							>
								<Trash2 className="size-4" />
							</button>
						</div>
						<div className="space-y-3 p-4">
							<Field>
								<FieldLabel
									htmlFor={`faq-${index}-question`}
									className="text-xs uppercase tracking-wider text-muted-fg"
								>
									Question
								</FieldLabel>
								<Input
									id={`faq-${index}-question`}
									value={item.question}
									maxLength={MAX_FAQ_QUESTION_LENGTH}
									onChange={(e) => update(index, { question: e.target.value })}
									placeholder="Do you work weekends?"
								/>
							</Field>
							<Field>
								<FieldLabel
									htmlFor={`faq-${index}-answer`}
									className="text-xs uppercase tracking-wider text-muted-fg"
								>
									Answer
								</FieldLabel>
								<Textarea
									id={`faq-${index}-answer`}
									value={item.answer}
									maxLength={MAX_FAQ_ANSWER_LENGTH}
									rows={3}
									onChange={(e) => update(index, { answer: e.target.value })}
									placeholder="Saturdays until 2pm. Sundays by arrangement for emergencies."
								/>
							</Field>
						</div>
					</div>
				))}
			</div>

			<Button
				variant="outline"
				onClick={() =>
					setFaqItems((prev) => [...prev, { question: "", answer: "" }])
				}
				disabled={faqItems.length >= MAX_FAQ_ITEMS}
			>
				<Plus className="mr-2 size-4" />
				Add a question
			</Button>
		</SectionShell>
	);
});
