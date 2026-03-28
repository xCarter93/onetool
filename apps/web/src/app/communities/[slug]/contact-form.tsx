"use client";

import React, { useState } from "react";
import { Send, CheckCircle, AlertCircle } from "lucide-react";
import { StyledInput } from "@/components/ui/styled/styled-input";
import {
	StyledCard,
	StyledCardHeader,
	StyledCardTitle,
	StyledCardDescription,
	StyledCardContent,
} from "@/components/ui/styled/styled-card";
import { StyledButton } from "@/components/ui/styled/styled-button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ContactFormProps {
	slug: string;
}

export function ContactForm({ slug }: ContactFormProps) {
	const [formState, setFormState] = useState({
		name: "",
		email: "",
		phone: "",
		message: "",
	});
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [submitSuccess, setSubmitSuccess] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);

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
				}),
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || "Submission failed");
			}

			setSubmitSuccess(true);
			setFormState({ name: "", email: "", phone: "", message: "" });
		} catch (err) {
			setSubmitError(
				err instanceof Error ? err.message : "Something went wrong"
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<StyledCard>
			<StyledCardHeader className="space-y-2">
				<StyledCardTitle className="text-xl sm:text-2xl">
					Get a Free Quote
				</StyledCardTitle>
				<StyledCardDescription>
					Tell us about your project and we&apos;ll get back to you
					within one business day.
				</StyledCardDescription>
			</StyledCardHeader>

			<StyledCardContent className="pt-4">
				{submitSuccess ? (
					<div className="flex flex-col items-center py-8 text-center">
						<div className="size-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
							<CheckCircle className="size-8 text-green-600 dark:text-green-400" />
						</div>
						<h3 className="text-xl font-semibold text-fg mb-2">
							Message Sent!
						</h3>
						<p className="text-muted-fg text-sm">
							Thanks for reaching out. We&apos;ll get back to you
							within one business day.
						</p>
					</div>
				) : (
					<form onSubmit={handleSubmit} className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="name" className="text-sm font-medium">
								Name <span className="text-danger">*</span>
							</Label>
							<StyledInput
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
							<StyledInput
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
							<StyledInput
								id="phone"
								type="tel"
								value={formState.phone}
								onChange={(e) =>
									setFormState((s) => ({ ...s, phone: e.target.value }))
								}
								placeholder="(555) 123-4567"
							/>
						</div>
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
							<div className="flex items-start gap-2 p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger">
								<AlertCircle className="size-4 flex-shrink-0 mt-0.5" />
								<span className="text-sm">{submitError}</span>
							</div>
						)}

						<StyledButton
							type="submit"
							intent="primary"
							size="md"
							className="w-full"
							disabled={isSubmitting}
							isLoading={isSubmitting}
							icon={!isSubmitting && <Send className="size-4" />}
						>
							{isSubmitting ? "Sending..." : "Request a Quote"}
						</StyledButton>
					</form>
				)}
			</StyledCardContent>
		</StyledCard>
	);
}
