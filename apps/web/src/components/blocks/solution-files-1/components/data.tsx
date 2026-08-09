import { type ReactNode } from "react"
import { type Id } from "@onetool/backend/convex/_generated/dataModel"
import { FolderIcon, FileTextIcon, ImageIcon, FileIcon } from "lucide-react"

// ── Types ──

/** Glyph family, not file format. The exact format travels in `typeLabel`. */
export type FileKind = "folder" | "document" | "image" | "file"

export interface DriveOwner {
	name: string
	/** Profile image URL; initials render when absent or it fails to load. */
	image?: string | null
}

/** Org document as the backend's enriched `list` returns it. */
export interface OrgDocumentRecord {
	_id: Id<"organizationDocuments">
	name: string
	description?: string
	fileSize?: number
	mimeType?: string
	folderId?: Id<"organizationDocumentFolders">
	uploadedAt: number
	uploaderName: string | null
	uploaderImage?: string | null
}

export interface OrgFolderRecord {
	_id: Id<"organizationDocumentFolders">
	name: string
	parentId?: Id<"organizationDocumentFolders">
	createdAt: number
}

export interface DriveNode {
	id: string
	name: string
	kind: FileKind
	/** Exact format shown in the Type column: PDF, PNG, DOCX, Folder. */
	typeLabel: string
	/** Bytes on disk. Always 0 on a folder: folder size derives from children. */
	sizeBytes: number
	owner: DriveOwner
	/** Epoch ms; uploadedAt for files, createdAt for folders. */
	modifiedAt: number
	description?: string
	mimeType?: string
	/** Set on files only. */
	documentId?: Id<"organizationDocuments">
	/** Set on folders only. */
	folderId?: Id<"organizationDocumentFolders">
	children?: DriveNode[]
}

/** One node with every tree-derived measure resolved. */
export interface DriveRow {
	id: string
	node: DriveNode
	/** Own size on a file, summed descendant size on a folder. */
	sizeBytes: number
	/** Nodes anywhere below this one. Zero on a file. */
	itemCount: number
	children?: DriveRow[]
}

// ── Constants ──

export const DRIVE_ROOT_ID = "root"

// Static icon nodes per glyph family. Icon names must stay literal, so the
// whole element lives in data.
// prettier-ignore
export const FILE_KIND_ICONS: Record<FileKind, ReactNode> = {
	folder: <FolderIcon aria-hidden="true" />,
	document: <FileTextIcon aria-hidden="true" />,
	image: <ImageIcon aria-hidden="true" />,
	file: <FileIcon aria-hidden="true" />,
}

/** Filterable glyph families, in the order the Type filter lists them. */
export const FILE_KIND_OPTIONS: { value: FileKind; label: string }[] = [
	{ value: "folder", label: "Folders" },
	{ value: "document", label: "Documents" },
	{ value: "image", label: "Images" },
	{ value: "file", label: "Other" },
]

// ── Mapping ──

/** MIME type to the drive's own file kind, which drives the row icon. */
export function kindFromMimeType(mimeType: string | undefined): FileKind {
	if (!mimeType) return "document"
	if (mimeType.startsWith("image/")) return "image"
	if (/pdf|word|document|spreadsheet|presentation|ms-excel|ms-powerpoint|text\/|csv/.test(mimeType)) {
		return "document"
	}
	return "file"
}

/** Exact-format label from the file name's extension, falling back to MIME. */
export function typeLabelFor(name: string, mimeType: string | undefined): string {
	const extension = name.includes(".") ? name.split(".").pop() : undefined
	if (extension && extension.length <= 5) return extension.toUpperCase()
	if (mimeType === "application/pdf") return "PDF"
	if (mimeType?.startsWith("image/")) return mimeType.slice(6).toUpperCase()
	return "File"
}

/**
 * Assembles the folder tree from the two flat Convex lists. Orphaned rows
 * (folder chains broken mid-write) fall back to the root rather than
 * disappearing. Folders sort before files; each group alphabetically.
 */
export function buildDriveTree(
	folders: OrgFolderRecord[],
	documents: OrgDocumentRecord[]
): DriveNode[] {
	const folderNodes = new Map<string, DriveNode>()
	for (const folder of folders) {
		folderNodes.set(folder._id, {
			id: folder._id,
			name: folder.name,
			kind: "folder",
			typeLabel: "Folder",
			sizeBytes: 0,
			owner: { name: "" },
			modifiedAt: folder.createdAt,
			folderId: folder._id,
			children: [],
		})
	}

	const roots: DriveNode[] = []
	for (const folder of folders) {
		const node = folderNodes.get(folder._id)!
		const parent = folder.parentId ? folderNodes.get(folder.parentId) : undefined
		if (parent) parent.children!.push(node)
		else roots.push(node)
	}

	for (const doc of documents) {
		const node: DriveNode = {
			id: doc._id,
			name: doc.name,
			kind: kindFromMimeType(doc.mimeType),
			typeLabel: typeLabelFor(doc.name, doc.mimeType),
			sizeBytes: doc.fileSize ?? 0,
			owner: { name: doc.uploaderName ?? "", image: doc.uploaderImage ?? null },
			modifiedAt: doc.uploadedAt,
			description: doc.description,
			mimeType: doc.mimeType,
			documentId: doc._id,
		}
		const parent = doc.folderId ? folderNodes.get(doc.folderId) : undefined
		if (parent) parent.children!.push(node)
		else roots.push(node)
	}

	const sortLevel = (nodes: DriveNode[]) => {
		nodes.sort((a, b) => {
			const folderDelta = Number(b.kind === "folder") - Number(a.kind === "folder")
			return folderDelta !== 0 ? folderDelta : a.name.localeCompare(b.name)
		})
		for (const node of nodes) if (node.children) sortLevel(node.children)
	}
	sortLevel(roots)

	return roots
}

// ── Derivation ──

/**
 * Resolves size and item count for every node in one pass. A file reports its
 * own bytes and no children; a folder sums whatever is under it.
 */
export function buildDriveRows(nodes: DriveNode[]): DriveRow[] {
	return nodes.map((node) => {
		if (!node.children) {
			return { id: node.id, node, sizeBytes: node.sizeBytes, itemCount: 0 }
		}

		const children = buildDriveRows(node.children)

		return {
			id: node.id,
			node,
			sizeBytes: children.reduce((sum, child) => sum + child.sizeBytes, 0),
			itemCount: children.reduce((count, child) => count + 1 + child.itemCount, 0),
			children,
		}
	})
}

/** Immediate children of a folder id, or the drive root when it is the root. */
export function listFolder(rows: DriveRow[], folderId: string): DriveRow[] {
	if (folderId === DRIVE_ROOT_ID) return rows

	const match = findRow(rows, folderId)
	return match?.children ?? []
}

export function findRow(rows: DriveRow[], id: string): DriveRow | undefined {
	for (const row of rows) {
		if (row.id === id) return row
		const nested = row.children ? findRow(row.children, id) : undefined
		if (nested) return nested
	}
	return undefined
}

/** Folder ids from the drive root down to `folderId`, inclusive. */
export function getFolderPath(rows: DriveRow[], folderId: string): string[] {
	if (folderId === DRIVE_ROOT_ID) return [DRIVE_ROOT_ID]

	function walk(current: DriveRow[], trail: string[]): string[] | undefined {
		for (const row of current) {
			const next = [...trail, row.id]
			if (row.id === folderId) return next
			if (row.children) {
				const found = walk(row.children, next)
				if (found) return found
			}
		}
		return undefined
	}

	return walk(rows, [DRIVE_ROOT_ID]) ?? [DRIVE_ROOT_ID]
}

/** Flattens every file below `rows`, skipping folders. */
export function collectFiles(rows: DriveRow[]): DriveRow[] {
	return rows.flatMap((row) => (row.children ? collectFiles(row.children) : [row]))
}

/** Flattens every row below `rows`, folders included. */
export function collectAllRows(rows: DriveRow[]): DriveRow[] {
	return rows.flatMap((row) =>
		row.children ? [row, ...collectAllRows(row.children)] : [row]
	)
}

/** Every document id at or below the given rows, for bulk operations. */
export function collectDocumentIds(rows: DriveRow[]): Id<"organizationDocuments">[] {
	return collectAllRows(rows)
		.map((row) => row.node.documentId)
		.filter((id): id is Id<"organizationDocuments"> => id !== undefined)
}

// ── Formatting ──

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"]

/** Presentation only; sorting reads the raw `sizeBytes` field. */
export function formatBytes(bytes: number) {
	if (bytes <= 0) return "0 B"

	const exponent = Math.min(
		Math.floor(Math.log(bytes) / Math.log(1024)),
		BYTE_UNITS.length - 1
	)
	const value = bytes / 1024 ** exponent
	const fractionDigits = exponent === 0 ? 0 : value >= 10 ? 1 : 2

	return `${value.toFixed(fractionDigits)} ${BYTE_UNITS[exponent]}`
}

export function formatCount(value: number) {
	return value.toLocaleString("en-US")
}

export function getInitials(name: string) {
	return name
		.split(" ")
		.map((part) => part[0])
		.join("")
		.slice(0, 2)
		.toUpperCase()
}

const RELATIVE_UNITS: { limit: number; divisor: number; unit: Intl.RelativeTimeFormatUnit }[] = [
	{ limit: 60_000, divisor: 1000, unit: "second" },
	{ limit: 3_600_000, divisor: 60_000, unit: "minute" },
	{ limit: 86_400_000, divisor: 3_600_000, unit: "hour" },
	{ limit: 604_800_000, divisor: 86_400_000, unit: "day" },
	{ limit: 2_629_800_000, divisor: 604_800_000, unit: "week" },
	{ limit: 31_557_600_000, divisor: 2_629_800_000, unit: "month" },
	{ limit: Infinity, divisor: 31_557_600_000, unit: "year" },
]

const relativeFormat = new Intl.RelativeTimeFormat("en", { numeric: "auto" })

/** "2 days ago" for recent timestamps, a plain date beyond a year. */
export function formatRelativeTime(timestamp: number) {
	const delta = Date.now() - timestamp
	if (delta < 30_000) return "Just now"
	for (const { limit, divisor, unit } of RELATIVE_UNITS) {
		if (delta < limit) {
			return relativeFormat.format(-Math.round(delta / divisor), unit)
		}
	}
	return new Date(timestamp).toLocaleDateString()
}

// ── Upload validation (mirrors the server-side rules in the create mutation) ──

export const UPLOAD_MAX_SIZE = 25 * 1024 * 1024

export const UPLOAD_ACCEPT = [
	"application/pdf",
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif",
	"image/heic",
	"image/heif",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	"application/vnd.openxmlformats-officedocument.presentationml.presentation",
	"application/msword",
	"application/vnd.ms-excel",
	"application/vnd.ms-powerpoint",
	"text/csv",
	"text/plain",
].join(",")
