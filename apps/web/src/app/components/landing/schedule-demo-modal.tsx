"use client";

import { useState } from "react";
import { StyledButton } from "@/components/ui/styled/styled-button";
import Modal from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ScheduleDemoModalProps {
	isOpen: boolean;
	onClose: () => void;
}

export default function ScheduleDemoModal({
	isOpen,
	onClose,
}: ScheduleDemoModalProps) {
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

	const handleScheduleDemo = async (e: React.FormEvent) => {
		e.preventDefault();
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

			setFormStatus({
				type: "success",
				message:
					"Thank you! We'll be in touch within 24 hours to schedule your demo.",
			});

			setTimeout(() => {
				setFormData({
					name: "",
					email: "",
					company: "",
					phone: "",
					message: "",
				});
				onClose();
				setFormStatus({ type: null, message: "" });
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
		<Modal isOpen={isOpen} onClose={onClose} title="Schedule a Demo" size="md">
			<div className="space-y-4">
				<p className="text-sm text-muted-foreground">
					Fill out the form below and we&apos;ll reach out within 24 hours to
					schedule your personalized demo.
				</p>

				<form onSubmit={handleScheduleDemo} className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="name">
							Name <span className="text-red-500">*</span>
						</Label>
						<Input
							id="name"
							type="text"
							required
							placeholder="John Doe"
							value={formData.name}
							onChange={(e) =>
								setFormData({ ...formData, name: e.target.value })
							}
							disabled={isSubmitting}
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="email">
							Email <span className="text-red-500">*</span>
						</Label>
						<Input
							id="email"
							type="email"
							required
							placeholder="john@company.com"
							value={formData.email}
							onChange={(e) =>
								setFormData({ ...formData, email: e.target.value })
							}
							disabled={isSubmitting}
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="company">Company</Label>
						<Input
							id="company"
							type="text"
							placeholder="Acme Inc."
							value={formData.company}
							onChange={(e) =>
								setFormData({ ...formData, company: e.target.value })
							}
							disabled={isSubmitting}
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="phone">Phone</Label>
						<Input
							id="phone"
							type="tel"
							placeholder="+1 (555) 123-4567"
							value={formData.phone}
							onChange={(e) =>
								setFormData({ ...formData, phone: e.target.value })
							}
							disabled={isSubmitting}
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="message">Message</Label>
						<Textarea
							id="message"
							placeholder="Tell us about your business and what you'd like to see in the demo..."
							value={formData.message}
							onChange={(e) =>
								setFormData({ ...formData, message: e.target.value })
							}
							disabled={isSubmitting}
							rows={4}
						/>
					</div>

					{formStatus.type && (
						<div
							className={`p-3 rounded-lg text-sm ${
								formStatus.type === "success"
									? "bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800"
									: "bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800"
							}`}
						>
							{formStatus.message}
						</div>
					)}

					<div className="flex justify-end gap-3 pt-4">
						<StyledButton
							type="button"
							intent="outline"
							onClick={onClose}
							disabled={isSubmitting}
						>
							Cancel
						</StyledButton>
						<StyledButton
							type="submit"
							intent="primary"
							isLoading={isSubmitting}
							disabled={
								isSubmitting ||
								!formData.name.trim() ||
								!formData.email.trim()
							}
						>
							{isSubmitting ? "Sending..." : "Request Demo"}
						</StyledButton>
					</div>
				</form>
			</div>
		</Modal>
	);
}
