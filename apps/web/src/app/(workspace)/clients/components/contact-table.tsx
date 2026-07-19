"use client";

import { useState, useMemo } from "react";
import { useMutation } from "convex/react";
import { toE164 } from "@/lib/phone";
import { api } from "@onetool/backend/convex/_generated/api";
import { useToast } from "@/hooks/use-toast";
import type { Id, Doc } from "@onetool/backend/convex/_generated/dataModel";
import {
	GlassCard,
	GlassCardContent,
	GlassCardHeader,
	GlassCardTitle,
} from "@/components/shared/glass-card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/reui/phone-input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/reui/badge";
import { EmptyState } from "@/components/domain/empty-state";
import {
	PlusIcon,
	PencilIcon,
	TrashIcon,
	CheckIcon,
	XMarkIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarFilledIcon } from "@heroicons/react/24/solid";

type Contact = {
	_id: Id<"clientContacts"> | string; // Allow temp IDs for new items
	firstName: string;
	lastName: string;
	email?: string;
	phone?: string;
	jobTitle?: string;
	isPrimary: boolean;
	isNew?: boolean; // Track if this is a new item not yet saved
};

interface ContactTableProps {
	clientId: Id<"clients">;
	contacts: Doc<"clientContacts">[];
	onChange?: () => void;
	hideCardWrapper?: boolean;
}

export function ContactTable({
	clientId,
	contacts,
	onChange,
	hideCardWrapper,
}: ContactTableProps) {
	const toast = useToast();
	const createContact = useMutation(api.clientContacts.create);
	const updateContact = useMutation(api.clientContacts.update);
	const deleteContact = useMutation(api.clientContacts.remove);

	// Local state
	const [editingId, setEditingId] = useState<
		Id<"clientContacts"> | string | null
	>(null);
	const [localContacts, setLocalContacts] = useState<Contact[]>([]);
	const [nextTempId, setNextTempId] = useState(1);

	// Combine saved contacts with local ones
	const allContacts = useMemo(() => {
		// Convert saved items to our Contact type
		const savedItems: Contact[] = contacts.map((item) => ({
			...item,
			isNew: false,
		}));

		console.log("allContacts useMemo:", {
			savedItems: savedItems.map((c) => ({
				id: c._id,
				name: `${c.firstName} ${c.lastName}`,
				isNew: c.isNew,
			})),
			localContacts: localContacts.map((c) => ({
				id: c._id,
				name: `${c.firstName} ${c.lastName}`,
				isNew: c.isNew,
			})),
		});

		// Combine and sort by creation time (newest first)
		return [...savedItems, ...localContacts];
	}, [contacts, localContacts]);

	const handleAddContact = () => {
		const tempId = `temp-${nextTempId}`;

		const newContact: Contact = {
			_id: tempId,
			firstName: "",
			lastName: "",
			email: "",
			phone: "",
			jobTitle: "",
			isPrimary: false,
			isNew: true,
		};

		setLocalContacts((prev) => [...prev, newContact]);
		setEditingId(tempId);
		setNextTempId((prev) => prev + 1);
	};

	const handleEditContact = (id: Id<"clientContacts"> | string) => {
		console.log("handleEditContact called with:", {
			id,
			idType: typeof id,
			contact: allContacts.find((c) => c._id === id),
		});
		setEditingId(id);
	};

	const handleSaveContact = async (contact: Contact) => {
		console.log("handleSaveContact called with:", {
			contactId: contact._id,
			contactIdType: typeof contact._id,
			isNew: contact.isNew,
			contactName: `${contact.firstName} ${contact.lastName}`,
		});

		// Check if this is a new contact by looking at the isNew flag or if it's a temporary ID
		const isNewContact =
			contact.isNew ||
			(typeof contact._id === "string" && contact._id.startsWith("temp-"));

		if (isNewContact) {
			// Save new contact directly to database
			console.log("Creating new contact...");
			try {
				await createContact({
					clientId,
					firstName: contact.firstName || "First Name Required",
					lastName: contact.lastName || "Last Name Required",
					email: contact.email,
					phone: contact.phone,
					jobTitle: contact.jobTitle,
					isPrimary: contact.isPrimary,
				});

				// Remove from local items
				setLocalContacts((prev) =>
					prev.filter((item) => item._id !== contact._id)
				);
				setEditingId(null);
				onChange?.();
				toast.success("Contact Saved", "Contact has been successfully saved!");
			} catch (error) {
				console.error("Failed to save contact:", error);
				toast.error("Error", "Failed to save contact. Please try again.");
			}
		} else {
			// Update existing item in database
			console.log("Updating existing contact with ID:", contact._id);
			try {
				await updateContact({
					id: contact._id as Id<"clientContacts">,
					firstName: contact.firstName,
					lastName: contact.lastName,
					email: contact.email,
					phone: contact.phone,
					jobTitle: contact.jobTitle,
					isPrimary: contact.isPrimary,
				});
				setEditingId(null);
				onChange?.();
				toast.success(
					"Contact Updated",
					"Contact has been successfully updated!"
				);
			} catch (error) {
				console.error("Failed to save contact:", error);
				toast.error("Error", "Failed to save contact. Please try again.");
			}
		}
	};

	const handleDeleteContact = async (id: Id<"clientContacts"> | string) => {
		// Check if this is a temporary ID (new item not yet saved)
		if (typeof id === "string" && id.startsWith("temp-")) {
			// Remove local item
			setLocalContacts((prev) => prev.filter((item) => item._id !== id));
			if (editingId === id) {
				setEditingId(null);
			}
			toast.success("Contact Deleted", "Unsaved contact has been removed.");
		} else {
			// Delete from database
			try {
				await deleteContact({ id: id as Id<"clientContacts"> });
				onChange?.();
				toast.success(
					"Contact Deleted",
					"Contact has been successfully deleted."
				);
			} catch (error) {
				console.error("Failed to delete contact:", error);
				toast.error("Error", "Failed to delete contact. Please try again.");
			}
		}
	};

	const header = (
		<div className="flex items-center justify-between pb-6">
			<h3 className="text-xl font-semibold text-foreground">Contacts</h3>
			<Button variant="outline" size="sm" onClick={handleAddContact}>
				<PlusIcon className="h-4 w-4 mr-2" />
				New Contact
			</Button>
		</div>
	);

	const content = allContacts && allContacts.length > 0 ? (
		<div className="overflow-hidden rounded-lg border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="w-[25%]">Name</TableHead>
						<TableHead className="w-[25%]">Job Title</TableHead>
						<TableHead className="w-[20%]">Phone</TableHead>
						<TableHead className="w-[20%]">Email</TableHead>
						<TableHead className="w-[5%]">Primary</TableHead>
						<TableHead className="w-[5%]">Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{allContacts.map((contact) => (
						<ContactRow
							key={contact._id}
							contact={contact}
							isEditing={editingId === contact._id}
							onEdit={() => handleEditContact(contact._id)}
							onSave={handleSaveContact}
							onCancel={() => setEditingId(null)}
							onDelete={() => handleDeleteContact(contact._id)}
						/>
					))}
				</TableBody>
			</Table>
		</div>
	) : (
		<EmptyState
			size="md"
			illustration="client-contacts-none"
			title="No contacts"
			description="No contacts have been added for this client yet."
		/>
	);

	if (hideCardWrapper) {
		return (
			<div>
				{header}
				{content}
			</div>
		);
	}

	return (
		<GlassCard>
			<GlassCardHeader className="flex flex-row items-center justify-between pb-6">
				<GlassCardTitle className="text-xl">Contacts</GlassCardTitle>
				<Button variant="outline" size="sm" onClick={handleAddContact}>
					<PlusIcon className="h-4 w-4 mr-2" />
					New Contact
				</Button>
			</GlassCardHeader>
			<GlassCardContent>
				{content}
			</GlassCardContent>
		</GlassCard>
	);
}

// ContactRow Component for inline editing
function ContactRow({
	contact,
	isEditing,
	onEdit,
	onSave,
	onCancel,
	onDelete,
}: {
	contact: Contact;
	isEditing: boolean;
	onEdit: () => void;
	onSave: (contact: Contact) => void;
	onCancel: () => void;
	onDelete: () => void;
}) {
	const [editedContact, setEditedContact] = useState<Contact>(() => ({
		...contact,
		phone: toE164(contact.phone),
	}));
	const [phoneTouched, setPhoneTouched] = useState(false);

	// Legacy free-text phone we couldn't parse: field renders empty, so surface the stored value
	const unparsedPhone =
		contact.phone && !toE164(contact.phone) ? contact.phone : "";

	// Resync edits from the source contact while editing
	const [prevSource, setPrevSource] = useState({ isEditing, contact });
	if (prevSource.isEditing !== isEditing || prevSource.contact !== contact) {
		setPrevSource({ isEditing, contact });
		if (isEditing) {
			setEditedContact({ ...contact, phone: toE164(contact.phone) });
			setPhoneTouched(false);
		}
	}

	const handleFieldChange = (field: keyof Contact, value: string | boolean) => {
		setEditedContact((prev) => ({
			...prev,
			[field]: value,
		}));
	};

	const handleSave = () => {
		console.log("ContactRow handleSave called with:", {
			contactId: editedContact._id,
			contactIdType: typeof editedContact._id,
			isNew: editedContact.isNew,
			originalContactId: contact._id,
			originalContactIdType: typeof contact._id,
		});
		// Never let an untouched, unparseable legacy phone be saved as ""
		const phone =
			phoneTouched || editedContact.phone
				? editedContact.phone
				: contact.phone;
		onSave({ ...editedContact, phone });
	};

	if (isEditing) {
		return (
			<TableRow
				className={`bg-blue-50/50 dark:bg-blue-900/10 border-l-4 border-l-blue-500 ${contact.isNew ? "bg-yellow-50/50 dark:bg-yellow-900/10" : ""}`}
			>
				<TableCell>
					<div className="space-y-2">
						<Input
							value={editedContact.firstName}
							onChange={(e) => handleFieldChange("firstName", e.target.value)}
							placeholder="First name..."
							className="w-full"
						/>
						<Input
							value={editedContact.lastName}
							onChange={(e) => handleFieldChange("lastName", e.target.value)}
							placeholder="Last name..."
							className="w-full"
						/>
					</div>
				</TableCell>
				<TableCell>
					<div className="space-y-2">
						<Input
							value={editedContact.jobTitle || ""}
							onChange={(e) => handleFieldChange("jobTitle", e.target.value)}
							placeholder="Job title..."
							className="w-full"
						/>
					</div>
				</TableCell>
				<TableCell>
					<PhoneInput
						defaultCountry="US"
						value={editedContact.phone || ""}
						onChange={(next) => {
							setPhoneTouched(true);
							handleFieldChange("phone", next ?? "");
						}}
						placeholder="(555) 123-4567"
						className="w-full"
					/>
					{unparsedPhone && !phoneTouched && (
						<p className="mt-1 text-xs text-muted-foreground">
							Saved as “{unparsedPhone}” — re-enter to update.
						</p>
					)}
				</TableCell>
				<TableCell>
					<Input
						value={editedContact.email || ""}
						onChange={(e) => handleFieldChange("email", e.target.value)}
						placeholder="Email..."
						className="w-full"
						type="email"
					/>
				</TableCell>
				<TableCell>
					<Checkbox
						checked={editedContact.isPrimary}
						onCheckedChange={(checked) =>
							handleFieldChange("isPrimary", !!checked)
						}
					/>
				</TableCell>
				<TableCell>
					<div className="flex gap-1">
						<Button
							variant="outline"
							size="icon-sm"
							onClick={handleSave}
							aria-label="Save"
						>
							<CheckIcon className="h-3 w-3" />
						</Button>
						<Button
							variant="outline"
							size="icon-sm"
							onClick={onCancel}
							aria-label="Cancel"
						>
							<XMarkIcon className="h-3 w-3" />
						</Button>
					</div>
				</TableCell>
			</TableRow>
		);
	}

	return (
		<TableRow
			className={`hover:bg-muted/50 ${contact.isNew ? "bg-yellow-50/30 dark:bg-yellow-900/20 border-l-4 border-l-yellow-400" : ""}`}
		>
			<TableCell className="font-medium">
				<div className="flex items-center gap-2">
					<span>
						{contact.firstName} {contact.lastName}
					</span>
					{contact.isNew && (
						<Badge variant="warning-light" radius="full">
							Unsaved
						</Badge>
					)}
				</div>
			</TableCell>
			<TableCell>
				<div>
					{contact.jobTitle && (
						<p className="font-medium">{contact.jobTitle}</p>
					)}
				</div>
			</TableCell>
			<TableCell>{contact.phone || "—"}</TableCell>
			<TableCell>{contact.email || "—"}</TableCell>
			<TableCell>
				{contact.isPrimary && (
					<StarFilledIcon className="h-4 w-4 text-yellow-400" />
				)}
			</TableCell>
			<TableCell>
				<div className="flex gap-1">
					<Button
						variant="outline"
						size="icon-sm"
						onClick={onEdit}
						aria-label="Edit"
					>
						<PencilIcon className="h-3 w-3" />
					</Button>
					<Button
						variant="outline"
						size="icon-sm"
						onClick={onDelete}
						aria-label="Delete"
					>
						<TrashIcon className="h-3 w-3" />
					</Button>
				</div>
			</TableCell>
		</TableRow>
	);
}
