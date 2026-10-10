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

// Mirrors /api/schedule-demo so the client and server agree on a valid address.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FieldErrors = { name?: string; email?: string };

const FIELD = "h-10 text-base";

function validate(name: string, email: string): FieldErrors {
	const errors: FieldErrors = {};
	if (!name.trim()) errors.name = "Enter your name.";
	if (!email.trim()) errors.email = "Enter your email address.";
	else if (!EMAIL_PATTERN.test(email)) errors.email = "Enter an email address like you@yourbusiness.com.";
	return errors;
}

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
	const [errors, setErrors] = useState<FieldErrors>({});
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
		setErrors({});
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

	const errorId = (name: keyof FieldErrors) => fieldId(`${name}-error`);
	const updateField = (name: keyof typeof formData, value: string) => {
		setFormData((prev) => ({ ...prev, [name]: value }));
		setErrors((prev) => ({ ...prev, [name]: undefined }));
	};

	const handleScheduleDemo = async (e: React.FormEvent) => {
		e.preventDefault();
		if (locked) return;

		const nextErrors = validate(formData.name, formData.email);
		setErrors(nextErrors);
		const firstInvalid = (["name", "email"] as const).find((name) => nextErrors[name]);
		if (firstInvalid) {
			document.getElementById(fieldId(firstInvalid))?.focus();
			return;
		}

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
					"Thank you. We’ll be in touch within 24 hours to schedule your demo.",
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
			noValidate
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
					autoComplete="name"
					placeholder="Your name"
					value={formData.name}
					onChange={(e) => updateField("name", e.target.value)}
					aria-invalid={errors.name ? true : undefined}
					aria-describedby={errors.name ? errorId("name") : undefined}
					disabled={locked}
					className={FIELD}
				/>
				{errors.name && (
					<p id={errorId("name")} className="text-sm text-danger">
						{errors.name}
					</p>
				)}
			</div>

			<div className="space-y-2">
				<Label htmlFor={fieldId("email")}>
					Email <span className="text-danger">*</span>
				</Label>
				<Input
					id={fieldId("email")}
					type="email"
					required
					autoComplete="email"
					placeholder="you@yourbusiness.com"
					value={formData.email}
					onChange={(e) => updateField("email", e.target.value)}
					aria-invalid={errors.email ? true : undefined}
					aria-describedby={errors.email ? errorId("email") : undefined}
					disabled={locked}
					className={FIELD}
				/>
				{errors.email && (
					<p id={errorId("email")} className="text-sm text-danger">
						{errors.email}
					</p>
				)}
			</div>

			<div className="space-y-2">
				<Label htmlFor={fieldId("company")}>Company</Label>
				<Input
					id={fieldId("company")}
					type="text"
					placeholder="Your business name"
					value={formData.company}
					onChange={(e) => updateField("company", e.target.value)}
					disabled={locked}
					className={FIELD}
				/>
			</div>

			<div className="space-y-2">
				<Label htmlFor={fieldId("phone")}>Phone</Label>
				<PhoneInput
					id={fieldId("phone")}
					defaultCountry="US"
					placeholder="(555) 123-4567"
					value={formData.phone}
					onChange={(next) => updateField("phone", next ?? "")}
					disabled={locked}
					className="[&_button]:h-auto [&_input]:h-10 [&_input]:text-base"
				/>
			</div>

			<div className={cn("space-y-2", full)}>
				<Label htmlFor={fieldId("message")}>Message</Label>
				<Textarea
					id={fieldId("message")}
					placeholder="Tell us about your business and what you’d like to see in the demo"
					value={formData.message}
					onChange={(e) => updateField("message", e.target.value)}
					disabled={locked}
					rows={4}
					className="text-base"
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
					variant="outline"
					disabled={locked}
					className="h-11 border-(--rule-2) bg-(--sheet) px-5 text-base font-semibold text-(--ink) hover:border-(--rule-3)"
				>
					{isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
					{isSubmitting ? "Sending" : "Book a demo"}
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
		<Modal isOpen={isOpen} onClose={onClose} title="Book a demo" size="md">
			<div className="space-y-4">
				<p className="text-sm text-muted-foreground">
					Fill out the form below and we&rsquo;ll reach out within 24 hours to
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
