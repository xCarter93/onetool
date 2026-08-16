"use client";

import React, { useState, useMemo } from "react";
import { useMutation } from "convex/react";
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
import {
	AddressAutocomplete,
	type AddressData,
} from "@/components/ui/address-autocomplete";
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

type Property = {
	_id: Id<"clientProperties"> | string; // Allow temp IDs for new items
	streetAddress: string;
	city: string;
	state: string;
	zipCode: string;
	country?: string;
	isPrimary: boolean;
	isNew?: boolean; // Track if this is a new item not yet saved
	// Geocoding fields (from Mapbox Address Autofill)
	latitude?: number | null;
	longitude?: number | null;
	formattedAddress?: string;
};

type PropertyField = "streetAddress" | "city" | "state" | "zipCode";
type PropertyErrors = Partial<Record<PropertyField, string>>;

interface PropertyTableProps {
	clientId: Id<"clients">;
	properties: Doc<"clientProperties">[];
	onChange?: () => void;
}

export function PropertyTable({
	clientId,
	properties,
	onChange,
}: PropertyTableProps) {
	const toast = useToast();
	const createProperty = useMutation(api.clientProperties.create);
	const updateProperty = useMutation(api.clientProperties.update);
	const deleteProperty = useMutation(api.clientProperties.remove);

	// Local state
	const [editingId, setEditingId] = useState<
		Id<"clientProperties"> | string | null
	>(null);
	const [localProperties, setLocalProperties] = useState<Property[]>([]);
	const [nextTempId, setNextTempId] = useState(1);

	// Combine saved properties with local ones
	const allProperties = useMemo(() => {
		const savedItems: Property[] = properties.map((item) => ({
			...item,
			isNew: false,
		}));

		return [...savedItems, ...localProperties];
	}, [properties, localProperties]);

	const handleAddProperty = () => {
		const tempId = `temp-${nextTempId}`;

		const newProperty: Property = {
			_id: tempId,
			streetAddress: "",
			city: "",
			state: "",
			zipCode: "",
			country: "",
			isPrimary: false,
			isNew: true,
			latitude: null,
			longitude: null,
			formattedAddress: "",
		};

		setLocalProperties((prev) => [...prev, newProperty]);
		setEditingId(tempId);
		setNextTempId((prev) => prev + 1);
	};

	const handleEditProperty = (id: Id<"clientProperties"> | string) => {
		setEditingId(id);
	};

	const handleSaveProperty = async (property: Property) => {
		// New properties carry a temp id until the first successful write
		const isNewProperty =
			property.isNew ||
			(typeof property._id === "string" && property._id.startsWith("temp-"));

		if (isNewProperty) {
			try {
				await createProperty({
					clientId,
					streetAddress: property.streetAddress.trim(),
					city: property.city.trim(),
					state: property.state.trim(),
					zipCode: property.zipCode.trim(),
					country: property.country,
					isPrimary: property.isPrimary,
					latitude: property.latitude ?? undefined,
					longitude: property.longitude ?? undefined,
					formattedAddress: property.formattedAddress,
				});

				setLocalProperties((prev) =>
					prev.filter((item) => item._id !== property._id),
				);
				setEditingId(null);
				onChange?.();
				toast.success(
					"Property saved",
					"Property has been successfully saved.",
				);
			} catch (error) {
				console.error("Failed to save property:", error);
				toast.error("Error", "Failed to save property. Please try again.");
			}
		} else {
			try {
				await updateProperty({
					id: property._id as Id<"clientProperties">,
					streetAddress: property.streetAddress.trim(),
					city: property.city.trim(),
					state: property.state.trim(),
					zipCode: property.zipCode.trim(),
					country: property.country,
					isPrimary: property.isPrimary,
					latitude: property.latitude ?? undefined,
					longitude: property.longitude ?? undefined,
					formattedAddress: property.formattedAddress,
				});
				setEditingId(null);
				onChange?.();
				toast.success(
					"Property updated",
					"Property has been successfully updated.",
				);
			} catch (error) {
				console.error("Failed to save property:", error);
				toast.error("Error", "Failed to save property. Please try again.");
			}
		}
	};

	const handleDeleteProperty = async (id: Id<"clientProperties"> | string) => {
		// Temp ids never reached the database
		if (typeof id === "string" && id.startsWith("temp-")) {
			setLocalProperties((prev) => prev.filter((item) => item._id !== id));
			if (editingId === id) {
				setEditingId(null);
			}
			toast.success("Property removed", "Unsaved property has been removed.");
		} else {
			try {
				await deleteProperty({ id: id as Id<"clientProperties"> });
				onChange?.();
				toast.success(
					"Property deleted",
					"Property has been successfully deleted.",
				);
			} catch (error) {
				console.error("Failed to delete property:", error);
				toast.error("Error", "Failed to delete property. Please try again.");
			}
		}
	};

	const handleCancel = (id: Id<"clientProperties"> | string) => {
		// Cancelling a never-saved row discards it rather than leaving a blank row
		if (typeof id === "string" && id.startsWith("temp-")) {
			setLocalProperties((prev) => prev.filter((item) => item._id !== id));
		}
		setEditingId(null);
	};

	return (
		<Frame>
			<FrameHeader className="flex-row items-center justify-between gap-3">
				<div className="flex flex-col gap-0.5">
					<FrameTitle>Properties</FrameTitle>
					<FrameDescription>
						Service addresses for this client.
					</FrameDescription>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					{allProperties.length > 0 && (
						<Badge variant="secondary" radius="full" size="lg">
							{allProperties.length}
						</Badge>
					)}
					<Button variant="outline" size="sm" onClick={handleAddProperty}>
						<PlusIcon className="h-4 w-4 mr-2" />
						New Property
					</Button>
				</div>
			</FrameHeader>

			<FramePanel className="p-0">
				{allProperties.length > 0 ? (
					<Table>
						<TableHeader>
							<TableRow className="bg-muted/40 hover:bg-muted/40">
								<TableHead className="w-[40%]">Address</TableHead>
								<TableHead className="w-[20%]">City</TableHead>
								<TableHead className="w-[15%]">State</TableHead>
								<TableHead className="w-[15%]">ZIP</TableHead>
								<TableHead className="w-[5%]">Primary</TableHead>
								<TableHead className="w-[5%] text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{allProperties.map((property) => (
								<PropertyRow
									key={property._id}
									property={property}
									isEditing={editingId === property._id}
									onEdit={() => handleEditProperty(property._id)}
									onSave={handleSaveProperty}
									onCancel={() => handleCancel(property._id)}
									onDelete={() => handleDeleteProperty(property._id)}
								/>
							))}
						</TableBody>
					</Table>
				) : (
					<EmptyState
						size="md"
						illustration="client-properties-none"
						title="No properties"
						description="No properties have been added for this client yet."
					/>
				)}
			</FramePanel>
		</Frame>
	);
}

// PropertyRow Component for inline editing
function PropertyRow({
	property,
	isEditing,
	onEdit,
	onSave,
	onCancel,
	onDelete,
}: {
	property: Property;
	isEditing: boolean;
	onEdit: () => void;
	onSave: (property: Property) => void;
	onCancel: () => void;
	onDelete: () => void;
}) {
	const [editedProperty, setEditedProperty] = useState<Property>(property);
	const [errors, setErrors] = useState<PropertyErrors>({});

	// Resync edits from the source property while editing
	const [prevSource, setPrevSource] = useState({ isEditing, property });
	if (prevSource.isEditing !== isEditing || prevSource.property !== property) {
		setPrevSource({ isEditing, property });
		if (isEditing) {
			setEditedProperty(property);
			setErrors({});
		}
	}

	const handleFieldChange = (
		field: keyof Property,
		value: string | number | boolean | undefined,
	) => {
		setEditedProperty((prev) => ({
			...prev,
			[field]: value,
		}));
		setErrors((prev) =>
			prev[field as PropertyField]
				? { ...prev, [field as PropertyField]: undefined }
				: prev,
		);
	};

	const handleSave = () => {
		const nextErrors: PropertyErrors = {};
		if (!editedProperty.streetAddress.trim())
			nextErrors.streetAddress = "Required";
		if (!editedProperty.city.trim()) nextErrors.city = "Required";
		if (!editedProperty.state.trim()) nextErrors.state = "Required";
		if (!editedProperty.zipCode.trim()) nextErrors.zipCode = "Required";

		if (Object.values(nextErrors).some(Boolean)) {
			setErrors(nextErrors);
			return;
		}

		onSave(editedProperty);
	};

	const handleAddressSelect = (address: AddressData) => {
		setEditedProperty((prev) => ({
			...prev,
			streetAddress: address.streetAddress,
			city: address.city,
			state: address.state,
			zipCode: address.zipCode,
			country: address.country,
			latitude: address.latitude,
			longitude: address.longitude,
			formattedAddress: address.formattedAddress,
		}));
		setErrors({});
	};

	if (isEditing) {
		return (
			<TableRow className="border-l-2 border-l-primary bg-primary/5 hover:bg-primary/5">
				<TableCell className="align-top">
					<AddressAutocomplete
						value={editedProperty.streetAddress}
						onChange={(value) => handleFieldChange("streetAddress", value)}
						onAddressSelect={handleAddressSelect}
						placeholder="Street address"
						aria-invalid={!!errors.streetAddress}
						className="w-full"
					/>
					{errors.streetAddress && (
						<p className="mt-1 text-xs text-destructive">
							{errors.streetAddress}
						</p>
					)}
				</TableCell>
				<TableCell className="align-top">
					<Input
						value={editedProperty.city}
						onChange={(e) => handleFieldChange("city", e.target.value)}
						placeholder="City"
						aria-label="City"
						aria-invalid={!!errors.city}
						className="w-full"
					/>
					{errors.city && (
						<p className="mt-1 text-xs text-destructive">{errors.city}</p>
					)}
				</TableCell>
				<TableCell className="align-top">
					<Input
						value={editedProperty.state}
						onChange={(e) => handleFieldChange("state", e.target.value)}
						placeholder="State"
						aria-label="State"
						aria-invalid={!!errors.state}
						className="w-full"
					/>
					{errors.state && (
						<p className="mt-1 text-xs text-destructive">{errors.state}</p>
					)}
				</TableCell>
				<TableCell className="align-top">
					<Input
						value={editedProperty.zipCode}
						onChange={(e) => handleFieldChange("zipCode", e.target.value)}
						placeholder="ZIP"
						aria-label="ZIP code"
						aria-invalid={!!errors.zipCode}
						className="w-full"
					/>
					{errors.zipCode && (
						<p className="mt-1 text-xs text-destructive">{errors.zipCode}</p>
					)}
				</TableCell>
				<TableCell className="align-top">
					<Checkbox
						checked={editedProperty.isPrimary}
						onCheckedChange={(checked) =>
							handleFieldChange("isPrimary", !!checked)
						}
						aria-label="Primary property"
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
				property.isNew
					? "border-l-2 border-l-warning bg-warning/5 hover:bg-warning/10"
					: undefined
			}
		>
			<TableCell className="font-medium">
				<div className="flex items-center gap-2">
					<span>{property.streetAddress}</span>
					{property.isNew && (
						<Badge variant="warning-light" radius="full">
							Unsaved
						</Badge>
					)}
				</div>
			</TableCell>
			<TableCell className="text-muted-foreground">{property.city}</TableCell>
			<TableCell className="text-muted-foreground">{property.state}</TableCell>
			<TableCell className="tabular-nums text-muted-foreground">
				{property.zipCode}
			</TableCell>
			<TableCell>
				{property.isPrimary && (
					<>
						<StarFilledIcon
							className="h-4 w-4 text-warning"
							aria-hidden="true"
						/>
						<span className="sr-only">Primary property</span>
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
