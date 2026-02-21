"use client";

import { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import ComboBox from "@/components/ui/combo-box";
import { Separator } from "@/components/ui/separator";
import {
	Building2,
	MapPin,
	User,
	Mail,
	Phone,
} from "lucide-react";

const getStatusBadgeClass = (status?: string) => {
	switch (status) {
		case "lead":
		case "prospect":
			return "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400";
		case "active":
			return "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400";
		case "inactive":
			return "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400";
		case "archived":
			return "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400";
		default:
			return "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400";
	}
};

interface ProjectCreationSidebarProps {
	// Client
	clientOptions: string[];
	selectedClient: Doc<"clients"> | null;
	clientDetails: Doc<"clients"> | null | undefined;
	selectedClientId: Id<"clients"> | null;
	onClientSelect: (selection: string | null) => void;
	isLoading: boolean;
	// Property
	propertyOptions: string[];
	selectedProperty: Doc<"clientProperties"> | null;
	onPropertySelect: (selection: string | null) => void;
	// Contact
	contactOptions: string[];
	selectedContact: Doc<"clientContacts"> | null;
	onContactSelect: (selection: string | null) => void;
}

function getPropertyDisplayName(property: { propertyName?: string; streetAddress: string }) {
	return property.propertyName
		? `${property.propertyName} - ${property.streetAddress}`
		: property.streetAddress;
}

function getContactDisplayName(contact: { firstName: string; lastName: string; jobTitle?: string }) {
	return `${contact.firstName} ${contact.lastName}${contact.jobTitle ? ` - ${contact.jobTitle}` : ""}`;
}

export function ProjectCreationSidebar({
	clientOptions,
	selectedClient,
	clientDetails,
	selectedClientId,
	onClientSelect,
	isLoading,
	propertyOptions,
	selectedProperty,
	onPropertySelect,
	contactOptions,
	selectedContact,
	onContactSelect,
}: ProjectCreationSidebarProps) {
	return (
		<div className="px-5 py-4">
			{/* Client Selection Section */}
			<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
				Client Selection
			</h3>
			<div className="space-y-0">
				{/* Client ComboBox */}
				<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
					<Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
					<span className="text-sm text-muted-foreground w-28 shrink-0">Client *</span>
					<div className="flex-1 min-w-0">
						<ComboBox
							options={clientOptions}
							placeholder={
								selectedClient?.companyName ?? "Select a client..."
							}
							onSelect={onClientSelect}
							disabled={isLoading}
						/>
					</div>
				</div>

				{/* Client details after selection */}
				{clientDetails && (
					<>
						<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
							<div className="h-4 w-4 shrink-0" />
							<span className="text-sm text-muted-foreground w-28 shrink-0">Status</span>
							<div className="flex-1 min-w-0">
								<Badge
									className={getStatusBadgeClass(clientDetails.status)}
									variant="outline"
								>
									{clientDetails.status}
								</Badge>
							</div>
						</div>
						{clientDetails.companyDescription && (
							<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
								<div className="h-4 w-4 shrink-0" />
								<span className="text-sm text-muted-foreground w-28 shrink-0">Description</span>
								<div className="flex-1 min-w-0">
									<span className="text-sm text-foreground">
										{clientDetails.companyDescription.length > 100
											? clientDetails.companyDescription.slice(0, 100) + "..."
											: clientDetails.companyDescription}
									</span>
								</div>
							</div>
						)}
					</>
				)}
			</div>

			<Separator className="my-4" />

			{/* Property & Contact Section */}
			<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
				Property & Contact
			</h3>
			<div className="space-y-0">
				{/* Property */}
				<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
					<MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
					<span className="text-sm text-muted-foreground w-28 shrink-0">Property</span>
					<div className="flex-1 min-w-0">
						<ComboBox
							options={propertyOptions}
							placeholder={
								selectedProperty
									? getPropertyDisplayName(selectedProperty)
									: selectedClientId
										? propertyOptions.length > 0
											? "Select a property..."
											: "No properties"
										: "Select client first..."
							}
							onSelect={onPropertySelect}
							disabled={!selectedClientId || propertyOptions.length === 0}
						/>
					</div>
				</div>

				{/* Property details */}
				{selectedProperty && (
					<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
						<div className="h-4 w-4 shrink-0" />
						<span className="text-sm text-muted-foreground w-28 shrink-0">Address</span>
						<div className="flex-1 min-w-0">
							<span className="text-sm text-foreground">
								{[
									selectedProperty.streetAddress,
									selectedProperty.city,
									[selectedProperty.state, selectedProperty.zipCode]
										.filter(Boolean)
										.join(" "),
								]
									.filter(Boolean)
									.join(", ")}
							</span>
						</div>
					</div>
				)}

				{/* Contact */}
				<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
					<User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
					<span className="text-sm text-muted-foreground w-28 shrink-0">Contact</span>
					<div className="flex-1 min-w-0">
						<ComboBox
							options={contactOptions}
							placeholder={
								selectedContact
									? getContactDisplayName(selectedContact)
									: selectedClientId
										? contactOptions.length > 0
											? "Select a contact..."
											: "No contacts"
										: "Select client first..."
							}
							onSelect={onContactSelect}
							disabled={!selectedClientId || contactOptions.length === 0}
						/>
					</div>
				</div>

				{/* Contact details */}
				{selectedContact && (
					<>
						<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
							<div className="h-4 w-4 shrink-0" />
							<span className="text-sm text-muted-foreground w-28 shrink-0">Name</span>
							<div className="flex-1 min-w-0">
								<span className="text-sm font-medium text-foreground">
									{selectedContact.firstName} {selectedContact.lastName}
								</span>
							</div>
						</div>
						{selectedContact.email && (
							<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
								<Mail className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
								<span className="text-sm text-muted-foreground w-28 shrink-0">Email</span>
								<div className="flex-1 min-w-0">
									<a
										href={`mailto:${selectedContact.email}`}
										className="text-sm text-primary hover:text-primary/80 truncate block"
									>
										{selectedContact.email}
									</a>
								</div>
							</div>
						)}
						{selectedContact.phone && (
							<div className="flex items-start gap-3 py-2.5 -mx-2 px-2">
								<Phone className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
								<span className="text-sm text-muted-foreground w-28 shrink-0">Phone</span>
								<div className="flex-1 min-w-0">
									<span className="text-sm text-foreground">
										{selectedContact.phone}
									</span>
								</div>
							</div>
						)}
					</>
				)}
			</div>
		</div>
	);
}
