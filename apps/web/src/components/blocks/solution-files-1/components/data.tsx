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

/** The live Clients tree exactly as `drive.listClientsTree` returns it. */
export interface ClientsTree {
	clients: { _id: Id<"clients">; name: string }[]
	projects: { _id: Id<"projects">; name: string; clientId: Id<"clients"> }[]
	clientDocs: {
		_id: Id<"clientDocuments">
		clientId: Id<"clients">
		name: string
		fileName: string
		fileSize: number
		mimeType: string
		uploadedAt: number
		uploaderName: string | null
		uploaderImage?: string | null
	}[]
	projectDocs: {
		_id: Id<"projectDocuments">
		projectId: Id<"projects">
		name: string
		fileName: string
		fileSize: number
		mimeType: string
		uploadedAt: number
		uploaderName: string | null
		uploaderImage?: string | null
	}[]
	generatedDocs: {
		_id: Id<"documents">
		documentType: "quote" | "invoice"
		clientId: Id<"clients">
		projectId?: Id<"projects">
		signed: boolean
		generatedAt: number
		name: string
		fileSize: number | null
	}[]
	/** The server capped a bucket: older files are not in this tree. */
	hasMore: boolean
}

/**
 * Marks a node as belonging to the derived Clients tree rather than the org
 * drive. Absent on every org folder and org document, which is what every
 * org-only code path keys off.
 */
export type VirtualSource =
	| { type: "clients-root" }
	| { type: "client-folder"; clientId: Id<"clients"> }
	| { type: "project-folder"; projectId: Id<"projects">; clientId: Id<"clients"> }
	| { type: "client-doc"; id: Id<"clientDocuments">; clientId: Id<"clients"> }
	| { type: "project-doc"; id: Id<"projectDocuments">; projectId: Id<"projects"> }
	| {
			type: "generated-doc"
			id: Id<"documents">
			documentType: "quote" | "invoice"
			signed: boolean
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
	/** Set on org files only, and the discriminator every org-only path reads. */
	documentId?: Id<"organizationDocuments">
	/** Set on org folders only. */
	folderId?: Id<"organizationDocumentFolders">
	/** Set on Clients-tree nodes only. */
	source?: VirtualSource
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

/** System root of the derived Clients tree. Never an org folder id. */
export const CLIENTS_ROOT_ID = "clients-root"

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
	documents: OrgDocumentRecord[],
	clientsRoot?: DriveNode
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

	// Appended before the sort so the Clients root alphabetizes among the org
	// root folders instead of being pinned anywhere.
	if (clientsRoot) roots.push(clientsRoot)

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

/**
 * The Clients root and the client/project folders under it. Nothing here is
 * stored: the hierarchy is re-derived from the attachment and generated-PDF
 * rows on every read, so a folder exists exactly while it holds something the
 * user can see. The root itself is always returned, empty or not.
 */
export function buildClientsSubtree(tree: ClientsTree): DriveNode {
	const clientChildren = new Map<string, DriveNode[]>()
	const projectChildren = new Map<string, DriveNode[]>()
	const projectById = new Map(tree.projects.map((project) => [project._id as string, project]))

	const push = (bucket: Map<string, DriveNode[]>, key: string, node: DriveNode) => {
		const existing = bucket.get(key)
		if (existing) existing.push(node)
		else bucket.set(key, [node])
	}

	const attachment = (
		doc: ClientsTree["clientDocs"][number] | ClientsTree["projectDocs"][number],
		source: VirtualSource
	): DriveNode => ({
		id: doc._id,
		name: doc.name,
		kind: kindFromMimeType(doc.mimeType),
		typeLabel: typeLabelFor(doc.fileName, doc.mimeType),
		sizeBytes: doc.fileSize,
		owner: { name: doc.uploaderName ?? "", image: doc.uploaderImage ?? null },
		modifiedAt: doc.uploadedAt,
		mimeType: doc.mimeType,
		source,
	})

	for (const doc of tree.clientDocs) {
		push(
			clientChildren,
			doc.clientId,
			attachment(doc, { type: "client-doc", id: doc._id, clientId: doc.clientId })
		)
	}
	for (const doc of tree.projectDocs) {
		push(
			projectChildren,
			doc.projectId,
			attachment(doc, { type: "project-doc", id: doc._id, projectId: doc.projectId })
		)
	}

	for (const doc of tree.generatedDocs) {
		const node: DriveNode = {
			id: doc._id,
			name: doc.name,
			kind: "document",
			typeLabel: doc.documentType === "quote" ? "Quote" : "Invoice",
			sizeBytes: doc.fileSize ?? 0,
			owner: { name: "" },
			modifiedAt: doc.generatedAt,
			source: {
				type: "generated-doc",
				id: doc._id,
				documentType: doc.documentType,
				signed: doc.signed,
			},
		}
		// A quote or invoice with no project belongs to the client directly.
		if (doc.projectId && projectById.has(doc.projectId)) {
			push(projectChildren, doc.projectId, node)
		} else {
			push(clientChildren, doc.clientId, node)
		}
	}

	// Folders have no timestamp of their own, so they take the newest thing
	// inside them — that is what the Suggested band sorts on. An empty folder
	// (only the always-visible Clients root) reads as "just now", not the epoch.
	const newestOf = (children: DriveNode[]) =>
		children.length === 0
			? Date.now()
			: children.reduce((newest, child) => Math.max(newest, child.modifiedAt), 0)

	const clientFolders: DriveNode[] = []
	for (const client of tree.clients) {
		const children = [...(clientChildren.get(client._id) ?? [])]

		for (const project of tree.projects) {
			if (project.clientId !== client._id) continue
			const projectFiles = projectChildren.get(project._id)
			if (!projectFiles || projectFiles.length === 0) continue
			children.push({
				id: `project:${project._id}`,
				name: project.name,
				kind: "folder",
				typeLabel: "Folder",
				sizeBytes: 0,
				owner: { name: "" },
				modifiedAt: newestOf(projectFiles),
				source: {
					type: "project-folder",
					projectId: project._id,
					clientId: client._id,
				},
				children: projectFiles,
			})
		}

		if (children.length === 0) continue
		clientFolders.push({
			id: `client:${client._id}`,
			name: client.name,
			kind: "folder",
			typeLabel: "Folder",
			sizeBytes: 0,
			owner: { name: "" },
			modifiedAt: newestOf(children),
			source: { type: "client-folder", clientId: client._id },
			children,
		})
	}

	return {
		id: CLIENTS_ROOT_ID,
		name: "Clients",
		kind: "folder",
		typeLabel: "Folder",
		sizeBytes: 0,
		owner: { name: "" },
		modifiedAt: newestOf(clientFolders),
		source: { type: "clients-root" },
		children: clientFolders,
	}
}

// ── Capabilities ──

/** The two permission objects the drive spans, flattened to what rows need. */
export interface DrivePerms {
	orgModify: boolean
	orgDelete: boolean
	entityModify: boolean
	entityDelete: boolean
}

export type UploadTarget =
	| { kind: "org"; folderId?: Id<"organizationDocumentFolders"> }
	| { kind: "client"; clientId: Id<"clients"> }
	| { kind: "project"; projectId: Id<"projects"> }

/** Org nodes carry no `source`; every Clients-tree node does. */
function isOrgNode(node: DriveNode) {
	return node.source === undefined
}

/** Attachments are the only Clients-tree files a user can edit. */
function isEntityAttachment(node: DriveNode) {
	const type = node.source?.type
	return type === "client-doc" || type === "project-doc"
}

export function canRenameNode(node: DriveNode, perms: DrivePerms): boolean {
	if (isOrgNode(node)) return perms.orgModify
	return isEntityAttachment(node) && perms.entityModify
}

export function canDeleteNode(node: DriveNode, perms: DrivePerms): boolean {
	if (isOrgNode(node)) return perms.orgDelete
	return isEntityAttachment(node) && perms.entityDelete
}

/** Virtual folders are derived, so nothing can be filed into or out of them. */
export function canMoveNode(node: DriveNode, perms: DrivePerms): boolean {
	return isOrgNode(node) && perms.orgModify
}

/** The `drive.getFileUrls` reference for a node, or null if it is an org node. */
export function virtualFileRef(
	node: DriveNode
): { kind: "client" | "project" | "generated"; id: string } | null {
	const source = node.source
	if (source?.type === "client-doc") return { kind: "client", id: source.id }
	if (source?.type === "project-doc") return { kind: "project", id: source.id }
	if (source?.type === "generated-doc") return { kind: "generated", id: source.id }
	return null
}

/** Generated PDFs are read-only, and virtual folders are not real rows. */
export function isSelectableNode(node: DriveNode): boolean {
	return isOrgNode(node) || isEntityAttachment(node)
}

/**
 * Where an upload from the open folder would land. `null` means uploads have
 * nowhere to go: the Clients root, a virtual folder's own root, or (at the call
 * site) a scope view. Pass `null` for the org root, which has no node.
 */
export function uploadTargetForSelection(folder: DriveNode | null): UploadTarget | null {
	if (!folder) return { kind: "org" }

	const source = folder.source
	if (!source) return { kind: "org", folderId: folder.folderId }
	if (source.type === "client-folder") return { kind: "client", clientId: source.clientId }
	if (source.type === "project-folder") return { kind: "project", projectId: source.projectId }
	return null
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

/** Client and project attachments are capped lower than the org drive. */
export const ENTITY_UPLOAD_MAX_SIZE = 10 * 1024 * 1024

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
