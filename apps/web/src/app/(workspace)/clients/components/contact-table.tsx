"use client";

import { useState, useMemo } from "react";
import { useMutation } from "convex/react";
import { toE164 } from "@/lib/phone";
import { api } from "@onetool/backend/convex/_generated/api";
import { useToast } from "@/hooks/use-toast";
import type { Id, Doc } from "@onetool/backend/convex/_generated/dataModel";
import {
	Frame,
	FrameHeader,
	FrameTitle,
	FrameDescription,
	FramePanel,
} from "@/components/reui/frame";
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

type ContactErrors = Partial<Record<"firstName" | "lastName", string>>;

interface ContactTableProps {
	clientId: Id<"clients">;
	contacts: Doc<"clientContacts">[];
	onChange?: () => void;
}

export function ContactTable({
	clientId,
	contacts,
	onChange,
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
		const savedItems: Contact[] = contacts.map((item) => ({
			...item,
			isNew: false,
		}));

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
		setEditingId(id);
	};

	const handleSaveContact = async (contact: Contact) => {
		// New contacts carry a temp id until the first successful write
		const isNewContact =
			contact.isNew ||
			(typeof contact._id === "string" && contact._id.startsWith("temp-"));

		if (isNewContact) {
			try {
				await createContact({
					clientId,
					firstName: contact.firstName.trim(),
					lastName: contact.lastName.trim(),
					email: contact.email,
					phone: contact.phone,
					jobTitle: contact.jobTitle,
					isPrimary: contact.isPrimary,
				});

				setLocalContacts((prev) =>
					prev.filter((item) => item._id !== contact._id),
				);
				setEditingId(null);
				onChange?.();
				toast.success("Contact saved", "Contact has been successfully saved.");
			} catch (error) {
				console.error("Failed to save contact:", error);
				toast.error("Error", "Failed to save contact. Please try again.");
			}
		} else {
			try {
				await updateContact({
					id: contact._id as Id<"clientContacts">,
					firstName: contact.firstName.trim(),
					lastName: contact.lastName.trim(),
					email: contact.email,
					phone: contact.phone,
					jobTitle: contact.jobTitle,
					isPrimary: contact.isPrimary,
				});
				setEditingId(null);
				onChange?.();
				toast.success(
					"Contact updated",
					"Contact has been successfully updated.",
				);
			} catch (error) {
				console.error("Failed to save contact:", error);
				toast.error("Error", "Failed to save contact. Please try again.");
			}
		}
	};

	const handleDeleteContact = async (id: Id<"clientContacts"> | string) => {
		// Temp ids never reached the database
		if (typeof id === "string" && id.startsWith("temp-")) {
			setLocalContacts((prev) => prev.filter((item) => item._id !== id));
			if (editingId === id) {
				setEditingId(null);
			}
			toast.success("Contact removed", "Unsaved contact has been removed.");
		} else {
			try {
				await deleteContact({ id: id as Id<"clientContacts"> });
				onChange?.();
				toast.success(
					"Contact deleted",
					"Contact has been successfully deleted.",
				);
			} catch (error) {
				console.error("Failed to delete contact:", error);
				toast.error("Error", "Failed to delete contact. Please try again.");
			}
		}
	};

	const handleCancel = (id: Id<"clientContacts"> | string) => {
		// Cancelling a never-saved row discards it rather than leaving a blank row
		if (typeof id === "string" && id.startsWith("temp-")) {
			setLocalContacts((prev) => prev.filter((item) => item._id !== id));
		}
		setEditingId(null);
	};

	return (
		<Frame>
			<FrameHeader className="flex-row items-center justify-between gap-3">
				<div className="flex flex-col gap-0.5">
					<FrameTitle>Contacts</FrameTitle>
					<FrameDescription>People to reach at this client.</FrameDescription>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					{allContacts.length > 0 && (
						<Badge variant="secondary" radius="full" size="lg">
							{allContacts.length}
						</Badge>
					)}
					<Button variant="outline" size="sm" onClick={handleAddContact}>
						<PlusIcon className="h-4 w-4 mr-2" />
						New Contact
					</Button>
				</div>
			</FrameHeader>

			<FramePanel className="p-0">
				{allContacts.length > 0 ? (
					<Table>
						<TableHeader>
							<TableRow className="bg-muted/40 hover:bg-muted/40">
								<TableHead className="w-[26%]">Name</TableHead>
								<TableHead className="w-[22%]">Job Title</TableHead>
								<TableHead className="w-[20%]">Phone</TableHead>
								<TableHead className="w-[22%]">Email</TableHead>
								<TableHead className="w-[5%]">Primary</TableHead>
								<TableHead className="w-[5%] text-right">Actions</TableHead>
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
									onCancel={() => handleCancel(contact._id)}
									onDelete={() => handleDeleteContact(contact._id)}
								/>
							))}
						</TableBody>
					</Table>
				) : (
					<EmptyState
						size="md"
						illustration="client-contacts-none"
						title="No contacts"
						description="No contacts have been added for this client yet."
					/>
				)}
			</FramePanel>
		</Frame>
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
	const [errors, setErrors] = useState<ContactErrors>({});

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
			setErrors({});
		}
	}

	const handleFieldChange = (field: keyof Contact, value: string | boolean) => {
		setEditedContact((prev) => ({
			...prev,
			[field]: value,
		}));
		if (field === "firstName" || field === "lastName") {
			setErrors((prev) => ({ ...prev, [field]: undefined }));
		}
	};

	const handleSave = () => {
		const nextErrors: ContactErrors = {};
		if (!editedContact.firstName.trim()) nextErrors.firstName = "Required";
		if (!editedContact.lastName.trim()) nextErrors.lastName = "Required";

		if (nextErrors.firstName || nextErrors.lastName) {
			setErrors(nextErrors);
			return;
		}

		// Never let an untouched, unparseable legacy phone be saved as ""
		const phone =
			phoneTouched || editedContact.phone ? editedContact.phone : contact.phone;
		onSave({ ...editedContact, phone });
	};

	if (isEditing) {
		return (
			<TableRow className="border-l-2 border-l-primary bg-primary/5 hover:bg-primary/5">
				<TableCell className="align-top">
					<div className="flex flex-col gap-2">
						<div>
							<Input
								value={editedContact.firstName}
								onChange={(e) => handleFieldChange("firstName", e.target.value)}
								placeholder="First name"
								aria-label="First name"
								aria-invalid={!!errors.firstName}
								className="w-full"
							/>
							{errors.firstName && (
								<p className="mt-1 text-xs text-destructive">
									{errors.firstName}
								</p>
							)}
						</div>
						<div>
							<Input
								value={editedContact.lastName}
								onChange={(e) => handleFieldChange("lastName", e.target.value)}
								placeholder="Last name"
								aria-label="Last name"
								aria-invalid={!!errors.lastName}
								className="w-full"
							/>
							{errors.lastName && (
								<p className="mt-1 text-xs text-destructive">
									{errors.lastName}
								</p>
							)}
						</div>
					</div>
				</TableCell>
				<TableCell className="align-top">
					<Input
						value={editedContact.jobTitle || ""}
						onChange={(e) => handleFieldChange("jobTitle", e.target.value)}
						placeholder="Job title"
						aria-label="Job title"
						className="w-full"
					/>
				</TableCell>
				<TableCell className="align-top">
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
				<TableCell className="align-top">
					<Input
						value={editedContact.email || ""}
						onChange={(e) => handleFieldChange("email", e.target.value)}
						placeholder="Email"
						aria-label="Email"
						className="w-full"
						type="email"
					/>
				</TableCell>
				<TableCell className="align-top">
					<Checkbox
						checked={editedContact.isPrimary}
						onCheckedChange={(checked) =>
							handleFieldChange("isPrimary", !!checked)
						}
						aria-label="Primary contact"
					/>
				</TableCell>
				<TableCell className="align-top">
					<div className="flex justify-end gap-1">
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
			className={
				contact.isNew
					? "border-l-2 border-l-warning bg-warning/5 hover:bg-warning/10"
					: undefined
			}
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
			<TableCell className="text-muted-foreground">
				{contact.jobTitle || "—"}
			</TableCell>
			<TableCell className="tabular-nums">{contact.phone || "—"}</TableCell>
			<TableCell>{contact.email || "—"}</TableCell>
			<TableCell>
				{contact.isPrimary && (
					<>
						<StarFilledIcon
							className="h-4 w-4 text-warning"
							aria-hidden="true"
						/>
						<span className="sr-only">Primary contact</span>
					</>
				)}
			</TableCell>
			<TableCell>
				<div className="flex justify-end gap-1">
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
