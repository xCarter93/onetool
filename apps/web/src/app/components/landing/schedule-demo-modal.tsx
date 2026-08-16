"use client";

import { useState, useRef, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/reui/phone-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { AnalyticsEvents } from "@/lib/analytics-events";

interface ScheduleDemoFormProps {
	className?: string;
	/** Rendered as a Cancel button next to submit; omit for standalone use. */
	onCancel?: () => void;
	/** Fired 2s after a successful submit, once the form has reset. */
	onSuccess?: () => void;
	/** Prefix for field ids so two instances can coexist on one page. */
	idPrefix?: string;
	/**
	 * "grid" pairs the four short fields two-up from `sm`, halving the form's
	 * height for wide inline placements. "stack" is the modal's single column.
	 */
	layout?: "stack" | "grid";
}

export function ScheduleDemoForm({
	className,
	onCancel,
	onSuccess,
	idPrefix = "demo",
	layout = "stack",
}: ScheduleDemoFormProps) {
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [formData, setFormData] = useState({
		name: "",
		email: "",
		company: "",
		phone: "",
		message: "",
	});
	const [formStatus, setFormStatus] = useState<{
		type: "success" | "error" | null;
		message: string;
	}>({ type: null, message: "" });

	useEffect(() => {
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, []);

	const resetForm = () => {
		setFormData({ name: "", email: "", company: "", phone: "", message: "" });
		setFormStatus({ type: null, message: "" });
	};

	const fieldId = (name: string) => `${idPrefix}-${name}`;
	/* The success message sits on screen for 2s before resetForm clears the
	   fields. Releasing the controls on `isSubmitting` alone would leave a
	   still-populated, still-valid form re-armed for that whole window, so a
	   second click would POST again and fire a duplicate analytics event. */
	const locked = isSubmitting || formStatus.type === "success";
	const grid = layout === "grid";
	const full = grid ? "sm:col-span-2" : undefined;

	const handleScheduleDemo = async (e: React.FormEvent) => {
		e.preventDefault();
		if (locked) return;
		setIsSubmitting(true);
		setFormStatus({ type: null, message: "" });

		try {
			const response = await fetch("/api/schedule-demo", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(formData),
			});

			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.error || "Failed to send demo request");
			}

			trackEvent(AnalyticsEvents.DEMO_REQUEST_SUBMITTED, {
				has_company: Boolean(formData.company.trim()),
				has_phone: Boolean(formData.phone.trim()),
				has_message: Boolean(formData.message.trim()),
			});

			setFormStatus({
				type: "success",
				message:
					"Thank you! We'll be in touch within 24 hours to schedule your demo.",
			});

			// Always reset — inline consumers (final CTA) pass no onSuccess, and
			// leaving the fields filled invites a duplicate submit.
			timerRef.current = setTimeout(() => {
				resetForm();
				onSuccess?.();
			}, 2000);
		} catch (error) {
			setFormStatus({
				type: "error",
				message:
					error instanceof Error
						? error.message
						: "Failed to send demo request. Please try again.",
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<form
			onSubmit={handleScheduleDemo}
			className={cn(
				grid ? "grid gap-4 sm:grid-cols-2" : "space-y-4",
				className
			)}
		>
			<div className="space-y-2">
				<Label htmlFor={fieldId("name")}>
					Name <span className="text-danger">*</span>
				</Label>
				<Input
					id={fieldId("name")}
					type="text"
					required
					placeholder="John Doe"
					value={formData.name}
					onChange={(e) => setFormData({ ...formData, name: e.target.value })}
					disabled={locked}
				/>
			</div>

			<div className="space-y-2">
				<Label htmlFor={fieldId("email")}>
					Email <span className="text-danger">*</span>
				</Label>
				<Input
					id={fieldId("email")}
					type="email"
					required
					placeholder="john@company.com"
					value={formData.email}
					onChange={(e) => setFormData({ ...formData, email: e.target.value })}
					disabled={locked}
				/>
			</div>

			<div className="space-y-2">
				<Label htmlFor={fieldId("company")}>Company</Label>
				<Input
					id={fieldId("company")}
					type="text"
					placeholder="Acme Inc."
					value={formData.company}
					onChange={(e) => setFormData({ ...formData, company: e.target.value })}
					disabled={locked}
				/>
			</div>

			<div className="space-y-2">
				<Label htmlFor={fieldId("phone")}>Phone</Label>
				<PhoneInput
					id={fieldId("phone")}
					defaultCountry="US"
					placeholder="(555) 123-4567"
					value={formData.phone}
					onChange={(next) =>
						setFormData((prev) => ({ ...prev, phone: next ?? "" }))
					}
					disabled={locked}
				/>
			</div>

			<div className={cn("space-y-2", full)}>
				<Label htmlFor={fieldId("message")}>Message</Label>
				<Textarea
					id={fieldId("message")}
					placeholder="Tell us about your business and what you'd like to see in the demo..."
					value={formData.message}
					onChange={(e) => setFormData({ ...formData, message: e.target.value })}
					disabled={locked}
					rows={4}
				/>
			</div>

			{/* Live region stays mounted: some screen readers skip a region
			    inserted together with its content. */}
			<div role="status" aria-live="polite" aria-atomic="true" className={full}>
				{formStatus.type && (
					<div
						className={`p-3 rounded-lg text-sm text-foreground border ${
							formStatus.type === "success"
								? "bg-success/10 border-success/30"
								: "bg-danger/10 border-danger/30"
						}`}
					>
						{formStatus.message}
					</div>
				)}
			</div>

			<div className={cn("flex justify-end gap-3 pt-4", full)}>
				{onCancel && (
					<Button
						type="button"
						variant="outline"
						onClick={onCancel}
						disabled={isSubmitting}
					>
						Cancel
					</Button>
				)}
				<Button
					type="submit"
					variant="default"
					disabled={
						locked || !formData.name.trim() || !formData.email.trim()
					}
				>
					{isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
					{isSubmitting ? "Sending..." : "Request Demo"}
				</Button>
			</div>
		</form>
	);
}

interface ScheduleDemoModalProps {
	isOpen: boolean;
	onClose: () => void;
}

export default function ScheduleDemoModal({
	isOpen,
	onClose,
}: ScheduleDemoModalProps) {
	return (
		<Modal isOpen={isOpen} onClose={onClose} title="Schedule a Demo" size="md">
			<div className="space-y-4">
				<p className="text-sm text-muted-foreground">
					Fill out the form below and we&apos;ll reach out within 24 hours to
					schedule your personalized demo.
				</p>

				{/* key remount clears form state on close, matching the old resetForm. */}
				<ScheduleDemoForm
					key={isOpen ? "open" : "closed"}
					idPrefix="demo-modal"
					onCancel={onClose}
					onSuccess={onClose}
				/>
			</div>
		</Modal>
	);
}
