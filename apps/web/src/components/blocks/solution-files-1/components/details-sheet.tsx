"use client"

// File and folder details: metadata, an inline preview for images, and the
// rename/description editor. Replaces the demo block's fake version history.
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import {
	FILE_KIND_ICONS,
	formatBytes,
	formatCount,
	type DriveRow,
} from "./data"
import { DownloadIcon, ExternalLinkIcon } from "lucide-react"

function MetaRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between gap-3">
			<span className="text-muted-foreground text-sm">{label}</span>
			<span className="text-foreground min-w-0 truncate text-sm">{value}</span>
		</div>
	)
}

/**
 * Draft state lives here and the parent keys this component by the target id,
 * so opening a different item re-seeds the form by remounting instead of a
 * setState-in-effect sync.
 */
function DetailsEditor({
	target,
	onSave,
}: {
	target: DriveRow
	onSave: (patch: { name: string; description?: string }) => void
}) {
	const { node } = target
	const isFolder = node.kind === "folder"
	const [name, setName] = useState(node.name)
	const [description, setDescription] = useState(node.description ?? "")

	const trimmedName = name.trim()
	const dirty =
		trimmedName !== node.name || description.trim() !== (node.description ?? "")

	return (
		<div className="flex flex-col gap-4">
			<Field>
				<FieldLabel htmlFor="details-name">Name</FieldLabel>
				<Input
					id="details-name"
					value={name}
					onChange={(event) => setName(event.target.value)}
					autoComplete="off"
				/>
			</Field>
			{!isFolder ? (
				<Field>
					<FieldLabel htmlFor="details-description">Description</FieldLabel>
					<Textarea
						id="details-description"
						value={description}
						onChange={(event) => setDescription(event.target.value)}
						placeholder="What this document is for"
						rows={3}
					/>
				</Field>
			) : null}
			<Button
				type="button"
				className="self-start"
				disabled={!dirty || !trimmedName}
				onClick={() =>
					onSave({
						name: trimmedName,
						description: isFolder ? undefined : description.trim(),
					})
				}
			>
				Save Changes
			</Button>
		</div>
	)
}

export function DetailsSheet({
	target,
	url,
	locationLabel,
	canModify,
	onOpenChange,
	onSave,
	onDownload,
}: {
	target: DriveRow | null
	/** Signed URL for preview/open; undefined while loading, null on failure. */
	url?: string | null
	/** Human path of the folder the item sits in. */
	locationLabel: string
	canModify: boolean
	onOpenChange: (open: boolean) => void
	onSave: (patch: { name: string; description?: string }) => void
	onDownload: (row: DriveRow) => void
}) {
	if (!target) return null

	const { node } = target
	const isFolder = node.kind === "folder"
	const isImage = node.mimeType?.startsWith("image/") ?? false

	return (
		<Sheet open={target !== null} onOpenChange={onOpenChange}>
			<SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
				<SheetHeader className="border-b">
					<SheetTitle className="flex min-w-0 items-center gap-2">
						<span className="text-muted-foreground flex size-4 shrink-0 items-center justify-center [&_svg]:size-4">
							{FILE_KIND_ICONS[node.kind]}
						</span>
						<span className="min-w-0 truncate">{node.name}</span>
					</SheetTitle>
					<SheetDescription>
						{isFolder ? "Folder details" : "Document details"}
					</SheetDescription>
				</SheetHeader>

				<ScrollArea className="min-h-0 flex-1">
					<div className="flex flex-col gap-5 p-4">
						{isImage && url ? (
							<div className="bg-muted/30 flex max-h-64 items-center justify-center overflow-hidden rounded-lg border">
								{/* Signed Convex storage URL; next/image cannot optimize it. */}
								{/* eslint-disable-next-line @next/next/no-img-element */}
								<img
									src={url}
									alt={node.name}
									className="max-h-64 w-full object-contain"
								/>
							</div>
						) : null}

						<div className="flex flex-col gap-2.5">
							<MetaRow label="Type" value={node.typeLabel} />
							<MetaRow
								label="Size"
								value={
									isFolder
										? `${formatBytes(target.sizeBytes)} · ${formatCount(target.itemCount)} items`
										: formatBytes(target.sizeBytes)
								}
							/>
							<MetaRow label="Location" value={locationLabel} />
							<MetaRow
								label={isFolder ? "Created" : "Uploaded"}
								value={new Date(node.modifiedAt).toLocaleDateString(undefined, {
									year: "numeric",
									month: "short",
									day: "numeric",
								})}
							/>
							{!isFolder && node.owner.name ? (
								<MetaRow label="Uploaded by" value={node.owner.name} />
							) : null}
						</div>

						{canModify ? (
							<>
								<Separator />
								<DetailsEditor key={target.id} target={target} onSave={onSave} />
							</>
						) : null}
					</div>
				</ScrollArea>

				{!isFolder ? (
					<SheetFooter className="border-t">
						<div className="flex w-full items-center gap-2">
							<Button
								type="button"
								variant="outline"
								className="flex-1"
								disabled={!url}
								onClick={() => {
									if (url) window.open(url, "_blank", "noopener,noreferrer")
								}}
							>
								<ExternalLinkIcon data-icon="inline-start" aria-hidden="true" />
								Open
							</Button>
							<Button
								type="button"
								variant="outline"
								className="flex-1"
								onClick={() => onDownload(target)}
							>
								<DownloadIcon data-icon="inline-start" aria-hidden="true" />
								Download
							</Button>
						</div>
					</SheetFooter>
				) : null}
			</SheetContent>
		</Sheet>
	)
}
