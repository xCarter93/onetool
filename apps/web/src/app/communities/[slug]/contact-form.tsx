"use client";

import React, { useEffect, useRef, useState } from "react";
import { Send, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/reui/phone-input";
import {
	GlassCard,
	GlassCardHeader,
	GlassCardTitle,
	GlassCardDescription,
	GlassCardContent,
} from "@/components/shared/glass-card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface ContactFormProps {
	slug: string;
	serviceTags?: string[];
}

// Sentinel for the trailing "Something else" chip — never sent to the API.
const SOMETHING_ELSE = "__something_else__";

export function ContactForm({ slug, serviceTags }: ContactFormProps) {
	const [formState, setFormState] = useState({
		name: "",
		email: "",
		phone: "",
		message: "",
		website: "", // PUB-18: honeypot — humans never see or fill this
	});
	const [selectedService, setSelectedService] = useState<string | undefined>(
		undefined
	);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [submitSuccess, setSubmitSuccess] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const successRef = useRef<HTMLDivElement>(null);

	// The form — including the button that had focus — unmounts on success, so
	// move focus to the confirmation or keyboard users land back at the top.
	useEffect(() => {
		if (submitSuccess) successRef.current?.focus();
	}, [submitSuccess]);

	const serviceOptions =
		serviceTags && serviceTags.length > 0
			? [...serviceTags, SOMETHING_ELSE]
			: [];

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsSubmitting(true);
		setSubmitError(null);

		try {
			const response = await fetch("/api/communities/interest", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					slug,
					name: formState.name,
					email: formState.email,
					phone: formState.phone || undefined,
					message: formState.message || undefined,
					service:
						selectedService && selectedService !== SOMETHING_ELSE
							? selectedService
							: undefined,
					website: formState.website,
				}),
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || "Submission failed");
			}

			setSubmitSuccess(true);
			setFormState({
				name: "",
				email: "",
				phone: "",
				message: "",
				website: "",
			});
			setSelectedService(undefined);
		} catch (err) {
			setSubmitError(
				err instanceof Error ? err.message : "Something went wrong"
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<GlassCard>
			<GlassCardHeader className="space-y-2">
				<GlassCardTitle className="text-xl sm:text-2xl">
					Get a free quote
				</GlassCardTitle>
				<GlassCardDescription>
					Tell us about your project and we&apos;ll get back to you
					within one business day.
				</GlassCardDescription>
			</GlassCardHeader>

			<GlassCardContent className="pt-4">
				{submitSuccess ? (
					<div
						ref={successRef}
						tabIndex={-1}
						role="status"
						aria-live="polite"
						aria-atomic="true"
						className="flex flex-col items-center py-8 text-center focus:outline-none"
					>
						<div className="size-16 rounded-full bg-success/10 flex items-center justify-center mb-4">
							<CheckCircle className="size-8 text-success-foreground" aria-hidden="true" />
						</div>
						<h3 className="text-xl font-semibold text-fg mb-2">
							Request sent
						</h3>
						<p className="text-muted-fg text-sm">
							Thanks for reaching out. We&apos;ll get back to you
							within one business day.
						</p>
					</div>
				) : (
					<form onSubmit={handleSubmit} className="space-y-4">
						{/* PUB-18: honeypot field, invisible to humans */}
						<div aria-hidden="true" className="sr-only">
							<label htmlFor="website">Website</label>
							<input
								id="website"
								name="website"
								type="text"
								tabIndex={-1}
								autoComplete="off"
								value={formState.website}
								onChange={(e) =>
									setFormState((s) => ({
										...s,
										website: e.target.value,
									}))
								}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="name" className="text-sm font-medium">
								Name <span className="text-danger">*</span>
							</Label>
							<Input
								id="name"
								value={formState.name}
								onChange={(e) =>
									setFormState((s) => ({ ...s, name: e.target.value }))
								}
								placeholder="Your name"
								required
								minLength={2}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="email" className="text-sm font-medium">
								Email <span className="text-danger">*</span>
							</Label>
							<Input
								id="email"
								type="email"
								value={formState.email}
								onChange={(e) =>
									setFormState((s) => ({ ...s, email: e.target.value }))
								}
								placeholder="your@email.com"
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="phone" className="text-sm font-medium">
								Phone <span className="text-muted-fg">(optional)</span>
							</Label>
							<PhoneInput
								id="phone"
								defaultCountry="US"
								value={formState.phone}
								onChange={(next) =>
									setFormState((s) => ({ ...s, phone: next ?? "" }))
								}
								placeholder="(555) 123-4567"
							/>
						</div>
						{serviceOptions.length > 0 && (
							<fieldset className="m-0 space-y-2 border-0 p-0">
								<legend className="p-0 text-sm font-medium text-fg">
									What do you need?{" "}
									<span className="text-muted-fg">(optional)</span>
								</legend>
								<div className="flex flex-wrap gap-2">
									{serviceOptions.map((tag) => {
										const isSomethingElse = tag === SOMETHING_ELSE;
										const label = isSomethingElse
											? "Something else"
											: tag;
										return (
											<label
												key={tag}
												className="relative inline-flex"
											>
												<input
													type="radio"
													name="service-tag"
													value={tag}
													checked={selectedService === tag}
													onChange={() =>
														setSelectedService(tag)
													}
													onClick={() => {
														if (selectedService === tag) {
															setSelectedService(undefined);
														}
													}}
													className="peer sr-only"
												/>
												<span
													className={cn(
														"cursor-pointer select-none rounded-full border border-input bg-background px-3 py-1.5 text-sm text-fg transition-colors",
														"hover:bg-muted",
														"peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground",
														"peer-focus-visible:border-ring peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50"
													)}
												>
													{label}
												</span>
											</label>
										);
									})}
								</div>
							</fieldset>
						)}
						<div className="space-y-2">
							<Label htmlFor="message" className="text-sm font-medium">
								How can we help?{" "}
								<span className="text-muted-fg">(optional)</span>
							</Label>
							<Textarea
								id="message"
								value={formState.message}
								onChange={(e) =>
									setFormState((s) => ({
										...s,
										message: e.target.value,
									}))
								}
								placeholder="Describe your project or ask a question..."
								className="min-h-[100px] max-h-[200px] resize-y"
							/>
						</div>

						{submitError && (
							<div
								role="alert"
								className="flex items-start gap-2 p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger-foreground"
							>
								<AlertCircle className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
								<span className="text-sm">{submitError}</span>
							</div>
						)}

						<Button
							type="submit"
							variant="default"
							className="w-full"
							disabled={isSubmitting}
						>
							{isSubmitting ? (
								<Loader2 className="size-4 animate-spin" />
							) : (
								<Send className="size-4" />
							)}
							{isSubmitting ? "Sending…" : "Send request"}
						</Button>
					</form>
				)}
			</GlassCardContent>
		</GlassCard>
	);
}
