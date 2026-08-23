import { Fragment, type ReactNode } from "react"
import { Badge } from "@/components/reui/badge"
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header"
import { DataGridTableRowSelectAll } from "@/components/reui/data-grid/data-grid-table"
import { Checkbox } from "@/components/ui/checkbox"
import { type ColumnDef } from "@tanstack/react-table"

import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
	canDeleteNode,
	canMoveNode,
	canRenameNode,
	FILE_KIND_ICONS,
	formatBytes,
	formatCount,
	formatRelativeTime,
	getInitials,
	type DrivePerms,
	type DriveRow,
	type FileKind,
} from "./data"
import { InfoIcon, Trash2Icon, PencilIcon, FolderIcon, DownloadIcon, EllipsisVerticalIcon } from "lucide-react"

// Type sorts by glyph family first and only then by the exact format, so a sort
// on Type lands folders above files the way a drive reads.
const TYPE_RANK: Record<FileKind, number> = {
	folder: 0,
	document: 1,
	image: 2,
	file: 3,
}

export type DriveRowAction = "details" | "rename" | "move" | "download" | "remove"

const ROW_ACTIONS: {
	id: DriveRowAction
	label: string
	icon: ReactNode
	destructive?: boolean
	/** Folders have no blob to download. */
	filesOnly?: boolean
	/** Row-level gate; absent means the action is always offered. */
	allow?: (row: DriveRow, perms: DrivePerms) => boolean
}[] = [
	{ id: "details", label: "Details", icon: <InfoIcon aria-hidden="true" /> },
	{ id: "download", label: "Download", filesOnly: true, icon: <DownloadIcon aria-hidden="true" /> },
	{ id: "rename", label: "Rename", allow: (row, perms) => canRenameNode(row.node, perms), icon: <PencilIcon aria-hidden="true" /> },
	{ id: "move", label: "Move", allow: (row, perms) => canMoveNode(row.node, perms), icon: <FolderIcon aria-hidden="true" /> },
	{ id: "remove", label: "Delete", destructive: true, allow: (row, perms) => canDeleteNode(row.node, perms), icon: <Trash2Icon aria-hidden="true" /> },
]

function DriveNameCell({
	row,
	onOpen,
	upload,
}: {
	row: DriveRow
	onOpen: (row: DriveRow) => void
	/** Present only while the transfer is running or has failed. */
	upload?: { progress: number; status: "uploading" | "error" | "done" }
}) {
	const { node } = row
	const isFolder = node.kind === "folder"

	return (
		<div className="flex min-w-0 items-center gap-2">
			{/* While a file is uploading the slot shows the progress ring INSTEAD
			    of the file icon; the icon returns the moment the transfer settles. */}
			<span
				aria-hidden={upload?.status === "uploading" ? undefined : "true"}
				role={upload?.status === "uploading" ? "progressbar" : undefined}
				aria-valuenow={
					upload?.status === "uploading" ? Math.round(upload.progress) : undefined
				}
				aria-valuemin={upload?.status === "uploading" ? 0 : undefined}
				aria-valuemax={upload?.status === "uploading" ? 100 : undefined}
				aria-label={
					upload?.status === "uploading" ? `Uploading ${node.name}` : undefined
				}
				className={cn(
					"flex size-4 shrink-0 items-center justify-center [&_svg]:size-4",
					isFolder ? "text-foreground" : "text-muted-foreground"
				)}
			>
				{upload?.status === "uploading" ? (
					<svg className="size-4 -rotate-90" viewBox="0 0 16 16">
						<circle
							cx="8"
							cy="8"
							r="6"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							className="text-muted-foreground/25"
						/>
						<circle
							cx="8"
							cy="8"
							r="6"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeDasharray={2 * Math.PI * 6}
							strokeDashoffset={2 * Math.PI * 6 * (1 - upload.progress / 100)}
							className="text-primary transition-[stroke-dashoffset] duration-300"
						/>
					</svg>
				) : (
					FILE_KIND_ICONS[node.kind]
				)}
			</span>
			<button
				type="button"
				onClick={() => onOpen(row)}
				className="hover:text-primary text-foreground min-w-0 truncate text-start text-sm transition-colors"
			>
				<span className={cn("truncate", isFolder ? "font-semibold" : "font-medium")}>
					{node.name}
				</span>
			</button>
		</div>
	)
}

function DriveOwnerCell({ row }: { row: DriveRow }) {
	const { owner, kind } = row.node
	// Folders have no uploader; an empty cell reads cleaner than a dash.
	if (kind === "folder" || !owner.name) return null

	return (
		<div className="flex min-w-0 items-center gap-2">
			<Avatar className="size-5 shrink-0">
				{owner.image ? <AvatarImage src={owner.image} alt="" /> : null}
				<AvatarFallback className="text-[9px]">
					{getInitials(owner.name)}
				</AvatarFallback>
			</Avatar>
			<span className="text-foreground min-w-0 truncate text-sm">{owner.name}</span>
		</div>
	)
}

function DriveSizeCell({ row }: { row: DriveRow }) {
	const isFolder = row.node.kind === "folder"

	return (
		<div className="flex flex-col gap-0.5">
			<span className="text-foreground text-sm tabular-nums">
				{formatBytes(row.sizeBytes)}
			</span>
			{isFolder ? (
				<span className="text-muted-foreground text-xs tabular-nums">
					{formatCount(row.itemCount)} items
				</span>
			) : null}
		</div>
	)
}

function DriveActionsCell({
	row,
	perms,
	onAction,
}: {
	row: DriveRow
	perms: DrivePerms
	onAction: (action: DriveRowAction, row: DriveRow) => void
}) {
	const isFolder = row.node.kind === "folder"
	const actions = ROW_ACTIONS.filter(
		(action) =>
			!(action.filesOnly && isFolder) && (action.allow?.(row, perms) ?? true)
	)

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label={`Actions for ${row.node.name}`}
					>
						{/* prettier-ignore */}
						<EllipsisVerticalIcon className="size-4" aria-hidden="true" />
					</Button>
				}
			/>
			<DropdownMenuContent align="end" className="w-44">
				{actions.map((action) => (
					<Fragment key={action.id}>
						{action.destructive ? <DropdownMenuSeparator /> : null}
						<DropdownMenuItem
							variant={action.destructive ? "destructive" : undefined}
							onClick={() => onAction(action.id, row)}
						>
							{action.icon}
							{action.label}
						</DropdownMenuItem>
					</Fragment>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	)
}

function DriveUploadedCell({ row }: { row: DriveRow }) {
	const { owner, modifiedAt, kind } = row.node

	return (
		<div className="flex flex-col gap-0.5">
			<span className="text-foreground text-sm">
				{formatRelativeTime(modifiedAt)}
			</span>
			{kind !== "folder" && owner.name ? (
				<span className="text-muted-foreground min-w-0 truncate text-xs">
					{owner.name}
				</span>
			) : null}
		</div>
	)
}

/** Sorting/hiding/resizing are uniform, so only the varying bits are passed. */
type ColSpec = Partial<ColumnDef<DriveRow>> & {
	id: string
	headerTitle: string
}

function col(spec: ColSpec): ColumnDef<DriveRow> {
	const { headerTitle, meta, ...rest } = spec
	return {
		// visibility stays false: column visibility flows through the ViewSettings
		// popover; the header menu's toggle would silently no-op against the
		// controlled state.
		header: ({ column }) => (
			<DataGridColumnHeader column={column} visibility={false} />
		),
		enableSorting: true,
		enableHiding: true,
		enableResizing: false,
		...rest,
		meta: { headerTitle, ...meta },
	} as ColumnDef<DriveRow>
}

export function createDriveColumns({
	onOpen,
	onAction,
	uploads,
	perms,
}: {
	onOpen: (row: DriveRow) => void
	onAction: (action: DriveRowAction, row: DriveRow) => void
	/** Transfer state per node id. Absent ids are settled files and render plain. */
	uploads?: Record<string, { progress: number; status: "uploading" | "error" | "done" }>
	perms: DrivePerms
}): ColumnDef<DriveRow>[] {
	return [
		{
			id: "select",
			header: () => <DataGridTableRowSelectAll />,
			// Plain checkbox, not DataGridTableRowSelect: that helper also paints a
			// 2px primary edge stripe on selected rows, which reads as a stray bar
			// inside the settings pane.
			cell: ({ row }) =>
				row.getCanSelect() ? (
					<Checkbox
						checked={row.getIsSelected()}
						onCheckedChange={(value) => row.toggleSelected(!!value)}
						aria-label="Select row"
						className="align-[inherit]"
					/>
				) : null,
			size: 32,
			enableSorting: false,
			enableHiding: false,
			enableResizing: false,
		},
		col({
			id: "name",
			headerTitle: "Name",
			accessorFn: (row) => row.node.name,
			cell: ({ row }) => (
				<DriveNameCell
					row={row.original}
					onOpen={onOpen}
					upload={uploads?.[row.original.node.id]}
				/>
			),
			size: 300,
			minSize: 140,
			enableHiding: false,
			// Name absorbs the free width, so long names ellipsize instead of
			// squeezing every other column.
			meta: { autoSize: true },
		}),
		col({
			id: "owner",
			headerTitle: "Owner",
			accessorFn: (row) => row.node.owner.name,
			cell: ({ row }) => <DriveOwnerCell row={row.original} />,
			size: 160,
		}),
		col({
			id: "type",
			headerTitle: "Type",
			accessorFn: (row) => row.node.typeLabel,
			cell: ({ row }) => (
				<Badge variant="outline" className="font-normal">
					{row.original.node.typeLabel}
				</Badge>
			),
			size: 84,
			sortingFn: (rowA, rowB) => {
				const delta =
					TYPE_RANK[rowA.original.node.kind] - TYPE_RANK[rowB.original.node.kind]
				return delta !== 0
					? delta
					: rowA.original.node.typeLabel.localeCompare(rowB.original.node.typeLabel)
			},
		}),
		col({
			id: "size",
			headerTitle: "Size",
			accessorFn: (row) => row.sizeBytes,
			cell: ({ row }) => <DriveSizeCell row={row.original} />,
			size: 92,
			sortingFn: "basic",
		}),
		col({
			id: "modified",
			headerTitle: "Uploaded",
			accessorFn: (row) => row.node.modifiedAt,
			cell: ({ row }) => <DriveUploadedCell row={row.original} />,
			size: 128,
			sortingFn: "basic",
		}),
		{
			id: "actions",
			header: "",
			cell: ({ row }) => (
				<DriveActionsCell row={row.original} perms={perms} onAction={onAction} />
			),
			size: 56,
			enableSorting: false,
			enableHiding: false,
			enableResizing: false,
		},
	]
}
