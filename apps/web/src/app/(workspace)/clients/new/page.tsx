"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import {
	ClientOnboardingForm,
	ClientFormData,
} from "@/app/(workspace)/clients/components/client-onboarding-form";
import { StickyFormFooter } from "@/components/shared/sticky-form-footer";

export default function NewClientPage() {
	const [isLoading, setIsLoading] = useState(false);
	const [formErrors, setFormErrors] = useState<string[]>([]);
	const router = useRouter();
	const createClient = useMutation(api.clients.create);
	const createContact = useMutation(api.clientContacts.create);
	const createProperty = useMutation(api.clientProperties.create);

	const handleCancel = () => {
		router.push("/clients");
	};

	const handleSave = () => {
		// Trigger form submission via the form element
		const form = document.getElementById(
			"client-onboarding-form"
		) as HTMLFormElement;
		if (form) {
			form.requestSubmit();
		}
	};

	const handleFormSubmit = async (formData: ClientFormData) => {
		setIsLoading(true);
		setFormErrors([]);

		try {
			const clientData = {
				// Company Information
				companyName: formData.companyName.trim(),
				companyDescription: formData.companyDescription.trim() || undefined,
				status: formData.status as
					| "lead"
					| "active"
					| "inactive"
					| "archived",
				leadSource: formData.leadSource || undefined,

				// Communication preferences
				communicationPreference: formData.communicationPreference || undefined,

				// Metadata
				tags: formData.tags.trim()
					? formData.tags
							.split(",")
							.map((tag: string) => tag.trim())
							.filter(Boolean)
					: undefined,
				notes: formData.notes?.trim() ? formData.notes.trim() : undefined,

				// Generate portal access UUID client-side to keep the Convex mutation deterministic
				portalAccessId: crypto.randomUUID(),
			};

			const clientId = await createClient(clientData);

		// Create contacts
		for (const contact of formData.contacts) {
			if (contact.firstName.trim() && contact.lastName.trim()) {
				await createContact({
					clientId,
					firstName: contact.firstName.trim(),
					lastName: contact.lastName.trim(),
					email: contact.email.trim() || undefined,
					phone: contact.phone.trim() || undefined,
					jobTitle: contact.jobTitle.trim() || undefined,
					isPrimary: contact.isPrimary,
				});
			}
		}

		// Create properties
		for (const property of formData.properties) {
			if (property.streetAddress.trim()) {
				await createProperty({
					clientId,
					propertyName: property.propertyName.trim() || undefined,
					propertyType: property.propertyType || undefined,
					streetAddress: property.streetAddress.trim(),
					city: property.city.trim(),
					state: property.region.trim(),
					zipCode: property.postalCode.trim(),
					country: "United States", // Default to US, could be made configurable
					isPrimary: property.isPrimary,
				});
			}
		}

			// Navigate to clients list on success
			router.push("/clients");
		} catch (error) {
			console.error("Failed to create client:", error);
			setFormErrors(["Failed to create client. Please try again."]);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="min-h-screen pb-24">
			{/* Error Display */}
			{formErrors.length > 0 && (
				<div className="mx-6 mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
					<div className="text-red-800 dark:text-red-200">
						{formErrors.map((error, index) => (
							<p key={index} className="text-sm">
								{error}
							</p>
						))}
					</div>
				</div>
			)}

			{/* Form Component */}
			<ClientOnboardingForm
				title="New Client Onboarding"
				subtitle="Let's gather comprehensive information to establish a complete client profile with all necessary details for effective relationship management."
				onSubmit={handleFormSubmit}
				onCancel={handleCancel}
				isLoading={isLoading}
			/>

			{/* Sticky Form Footer */}
			<StickyFormFooter
				onCancel={handleCancel}
				onSave={handleSave}
				cancelText="Cancel"
				saveText="Create Client"
				isLoading={isLoading}
			/>
		</div>
	);
}
