"use client"

// Drive explorer over the org documents backend. Frameless and full-height on
// purpose: the block owns no outer card beyond its bordered shell, so it drops
// into the settings tab as the main module. Folders ride in a band above; the
// browse surface below holds files, and one TanStack table instance backs both
// its list and grid views.
import {
	Fragment,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react"
import { useConvex, useMutation, useQuery } from "convex/react"
import { api } from "@onetool/backend/convex/_generated/api"
import type { Id } from "@onetool/backend/convex/_generated/dataModel"
import { useFileUpload } from "@/hooks/use-file-upload"
import { useToast } from "@/hooks/use-toast"
import { usePermissions } from "@/hooks/use-permissions"
import { logError, getUserFriendlyErrorMessage } from "@/lib/error-logger"
import { DataGrid } from "@/components/reui/data-grid/data-grid"
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area"
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table"
import {
	getCoreRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	useReactTable,
	type RowSelectionState,
	type SortingState,
	type VisibilityState,
} from "@tanstack/react-table"

import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@/components/ui/input-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { EmptyState } from "@/components/domain/empty-state"
import { LearnMoreLink } from "@/components/help/learn-more"
import { createDriveColumns, type DriveRowAction } from "./columns"
import { DeleteDialog, NameDialog, type NamePrompt } from "./crud-dialogs"
import {
	buildDriveRows,
	buildDriveTree,
	collectAllRows,
	collectDocumentIds,
	collectFiles,
	DRIVE_ROOT_ID,
	FILE_KIND_OPTIONS,
	findRow,
	formatCount,
	getFolderPath,
	listFolder,
	UPLOAD_ACCEPT,
	UPLOAD_MAX_SIZE,
	type DriveRow,
	type FileKind,
} from "./data"
import { DetailsSheet } from "./details-sheet"
import { DriveEmptyState } from "./empty-state"
import { FileCardGrid } from "./file-card-grid"
import { FolderBand } from "./folder-band"
import {
	FolderTree,
	type DriveSelection,
	type FolderAction,
} from "./folder-tree"
import { MoveDialog } from "./move-dialog"
import { OptionSelect } from "./option-select"
import { DriveSelectionBar } from "./selection-bar"
import { UploadPanel, type UploadEntry, type UploadStatus } from "./upload-panel"
import {
	ViewSettings,
	type DriveDensity,
	type DriveProperty,
	type DriveSortKey,
} from "./view-settings"
import { FolderPlusIcon, UploadIcon, MenuIcon, SearchIcon, ListIcon, LayoutGridIcon } from "lucide-react"

const RECENT_LIMIT = 12
const SUGGESTED_FOLDER_LIMIT = 4
const VIEW_PREFS_KEY = "onetool.org-documents.view"

const SORT_STATES: Record<DriveSortKey, SortingState> = {
	"name-asc": [{ id: "name", desc: false }],
	"name-desc": [{ id: "name", desc: true }],
	"size-desc": [{ id: "size", desc: true }],
	"modified-desc": [{ id: "modified", desc: true }],
	"type-asc": [{ id: "type", desc: false }],
}

/**
 * Sorting is the single truth; the Sort select reads back out of it. A header
 * click can land on a state no preset names, so this reports "custom" and the
 * select shows it read-only rather than offering it as a choice.
 */
function sortKeyFromSorting(sorting: SortingState): DriveSortKey | "custom" {
	const match = Object.entries(SORT_STATES).find(
		([, state]) =>
			state[0].id === sorting?.[0]?.id && state[0].desc === sorting?.[0]?.desc
	)
	return (match?.[0] as DriveSortKey) ?? "custom"
}

// Icon names must stay static literals; prettier-ignore keeps the table flat.
// prettier-ignore
const TOOLBAR_ICONS = {
	folderPlus: <FolderPlusIcon data-icon="inline-start" aria-hidden="true" />,
	dropzone: <UploadIcon aria-hidden="true" />,
	upload: <UploadIcon data-icon="inline-start" aria-hidden="true" />,
	menu: <MenuIcon aria-hidden="true" />,
	search: <SearchIcon aria-hidden="true" />,
	list: <ListIcon className="size-4" aria-hidden="true" />,
	grid: <LayoutGridIcon className="size-4" aria-hidden="true" />,
}

type DriveViewMode = "list" | "grid"

interface ViewPrefs {
	density: DriveDensity
	viewMode: DriveViewMode
	visibleProperties: Record<DriveProperty, boolean>
}

const DEFAULT_VIEW_PREFS: ViewPrefs = {
	density: "compact",
	viewMode: "list",
	visibleProperties: { owner: true, type: true, size: true, modified: true },
}

/** Transfer state for one in-flight or settled upload. */
interface UploadRecord {
	name: string
	sizeBytes: number
	progress: number
	status: UploadStatus
}

/**
 * True below the `sm` breakpoint. The list view carries several columns that
 * cannot fit a phone without a sideways scroll, so the secondary ones fold
 * away there and the card view stays available for the full picture.
 */
function useIsNarrow() {
	const [narrow, setNarrow] = useState(false)

	useEffect(() => {
		const query = window.matchMedia("(max-width: 639px)")
		const sync = () => setNarrow(query.matches)
		sync()
		query.addEventListener("change", sync)
		window.addEventListener("resize", sync)
		return () => {
			query.removeEventListener("change", sync)
			window.removeEventListener("resize", sync)
		}
	}, [])

	return narrow
}

/** POSTs a file to a Convex signed upload URL with real progress. */
function uploadToStorage(
	uploadUrl: string,
	file: File,
	onProgress: (percent: number) => void,
	registerAbort: (abort: () => void) => void
): Promise<Id<"_storage">> {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest()
		registerAbort(() => xhr.abort())
		xhr.open("POST", uploadUrl)
		// The backend derives mimeType from this header; without it the create
		// mutation rejects the document.
		xhr.setRequestHeader("Content-Type", file.type)
		xhr.upload.onprogress = (event) => {
			if (event.lengthComputable) {
				onProgress(Math.min(99, (event.loaded / event.total) * 100))
			}
		}
		xhr.onload = () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				try {
					resolve(JSON.parse(xhr.responseText).storageId as Id<"_storage">)
				} catch {
					reject(new Error("Unexpected upload response"))
				}
			} else {
				reject(new Error(`Upload failed with status ${xhr.status}`))
			}
		}
		xhr.onerror = () => reject(new Error("Upload failed"))
		xhr.onabort = () => reject(new Error("Upload cancelled"))
		xhr.send(file)
	})
}

export function DriveExplorer() {
	const toast = useToast()
	const convex = useConvex()
	const { can } = usePermissions()
	const canModify = can("orgDocuments", "modify")
	const canDelete = can("orgDocuments", "delete")

	const documents = useQuery(api.organizationDocuments.list)
	const folders = useQuery(api.organizationDocumentFolders.list)
	const isLoading = documents === undefined || folders === undefined

	const createDocument = useMutation(api.organizationDocuments.create)
	const updateDocument = useMutation(api.organizationDocuments.update)
	const bulkRemoveDocuments = useMutation(api.organizationDocuments.bulkRemove)
	const moveDocuments = useMutation(api.organizationDocuments.move)
	const generateUploadUrl = useMutation(api.organizationDocuments.generateUploadUrl)
	const createFolder = useMutation(api.organizationDocumentFolders.create)
	const renameFolder = useMutation(api.organizationDocumentFolders.rename)
	const moveFolder = useMutation(api.organizationDocumentFolders.move)
	const removeFolder = useMutation(api.organizationDocumentFolders.remove)

	const driveRows = useMemo(
		() => buildDriveRows(buildDriveTree(folders ?? [], documents ?? [])),
		[folders, documents]
	)

	const [namePrompt, setNamePrompt] = useState<NamePrompt | null>(null)
	const [deleteTarget, setDeleteTarget] = useState<DriveRow | null>(null)
	const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
	const [moveTarget, setMoveTarget] = useState<DriveRow | null>(null)
	const [moveDestId, setMoveDestId] = useState<string>(DRIVE_ROOT_ID)
	const [moveParentId, setMoveParentId] = useState<string>(DRIVE_ROOT_ID)
	const [detailsTarget, setDetailsTarget] = useState<DriveRow | null>(null)
	const [selection, setSelection] = useState<DriveSelection>({
		type: "folder",
		id: DRIVE_ROOT_ID,
	})
	const [viewPrefs, setViewPrefs] = useState<ViewPrefs>(DEFAULT_VIEW_PREFS)
	const [sorting, setSorting] = useState<SortingState>(SORT_STATES["name-asc"])
	const [search, setSearch] = useState("")
	const [kindFilter, setKindFilter] = useState<FileKind | "all">("all")
	const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
	const [railOpen, setRailOpen] = useState(false)
	const [expandedFolderIds, setExpandedFolderIds] = useState<string[]>([
		DRIVE_ROOT_ID,
	])
	const { density, viewMode, visibleProperties } = viewPrefs

	// View preferences survive reloads. Loaded after mount so the server render
	// and first client render agree.
	const prefsLoaded = useRef(false)
	useEffect(() => {
		try {
			const raw = window.localStorage.getItem(VIEW_PREFS_KEY)
			if (raw) {
				const parsed = JSON.parse(raw) as Partial<ViewPrefs>
				setViewPrefs((current) => ({
					...current,
					...parsed,
					visibleProperties: {
						...current.visibleProperties,
						...parsed.visibleProperties,
					},
				}))
			}
		} catch {
			// Corrupt prefs fall back to defaults.
		}
		prefsLoaded.current = true
	}, [])
	useEffect(() => {
		if (!prefsLoaded.current) return
		try {
			window.localStorage.setItem(VIEW_PREFS_KEY, JSON.stringify(viewPrefs))
		} catch {
			// Private mode: prefs just don't persist.
		}
	}, [viewPrefs])

	// A deleted or externally-removed folder must not strand the view.
	const effectiveSelection = useMemo<DriveSelection>(
		() =>
			selection.type === "folder" &&
			selection.id !== DRIVE_ROOT_ID &&
			!isLoading &&
			!findRow(driveRows, selection.id)
				? { type: "folder", id: DRIVE_ROOT_ID }
				: selection,
		[selection, isLoading, driveRows]
	)

	// headless-tree caches its item instances, so changing the loader data is
	// not enough: the rail remounts whenever the folder shape changes.
	// Expansion is owned here so it survives that remount.
	const folderSignature = useMemo(
		() =>
			collectAllRows(driveRows)
				.filter((row) => row.node.kind === "folder")
				.map((row) => `${row.id}:${row.node.name}`)
				.join("|"),
		[driveRows]
	)

	const scopeRows = useMemo(() => {
		if (effectiveSelection.type === "folder") {
			return listFolder(driveRows, effectiveSelection.id)
		}

		return [...collectFiles(driveRows)]
			.sort((a, b) => b.node.modifiedAt - a.node.modifiedAt)
			.slice(0, RECENT_LIMIT)
	}, [effectiveSelection, driveRows])

	const query = search.trim().toLowerCase()
	const filteredRows = useMemo(
		() =>
			scopeRows.filter((row) => {
				const matchesKind = kindFilter === "all" || row.node.kind === kindFilter
				const matchesQuery =
					!query ||
					row.node.name.toLowerCase().includes(query) ||
					row.node.owner.name.toLowerCase().includes(query)
				return matchesKind && matchesQuery
			}),
		[scopeRows, kindFilter, query]
	)

	// The band is a short suggestion strip; the table and grid still list every
	// row, folders included, so nothing is reachable only from the band.
	const suggestedFolders = useMemo(
		() =>
			filteredRows
				.filter((row) => row.node.kind === "folder")
				.sort((a, b) => b.node.modifiedAt - a.node.modifiedAt)
				.slice(0, SUGGESTED_FOLDER_LIMIT),
		[filteredRows]
	)

	const isDriveRoot =
		effectiveSelection.type === "folder" &&
		effectiveSelection.id === DRIVE_ROOT_ID
	const hasFilters = query.length > 0 || kindFilter !== "all"
	const isEmpty = filteredRows.length === 0
	const isDriveEmpty = !isLoading && driveRows.length === 0

	const isNarrow = useIsNarrow()

	const columnVisibility = useMemo<VisibilityState>(
		() => ({
			// On a phone only name and its actions survive: the rest would force
			// a horizontal scroll. The user's own choices are preserved and
			// reapply as soon as there is room.
			owner: !isNarrow && visibleProperties.owner,
			type: !isNarrow && visibleProperties.type,
			size: !isNarrow && visibleProperties.size,
			modified: !isNarrow && visibleProperties.modified,
		}),
		[visibleProperties, isNarrow]
	)

	// Navigating resets everything scoped to the old listing: a stale selection
	// would apply to rows the user can no longer see.
	const goTo = useCallback((next: DriveSelection) => {
		setSelection(next)
		setRowSelection({})
		setRailOpen(false)
	}, [])

	const handleOpen = useCallback(
		(row: DriveRow) => {
			if (row.node.kind === "folder") {
				goTo({ type: "folder", id: row.id })
				return
			}
			setDetailsTarget(row)
		},
		[goTo]
	)

	const currentFolderId =
		effectiveSelection.type === "folder" ? effectiveSelection.id : DRIVE_ROOT_ID
	const currentFolderConvexId =
		currentFolderId === DRIVE_ROOT_ID
			? undefined
			: (currentFolderId as Id<"organizationDocumentFolders">)

	/** The folder an item currently sits in, for the "current location" chip. */
	const parentOf = useCallback(
		(id: string) => {
			const path = getFolderPath(driveRows, id)
			return path[path.length - 2] ?? DRIVE_ROOT_ID
		},
		[driveRows]
	)

	const labelFor = useCallback(
		(id: string) =>
			id === DRIVE_ROOT_ID
				? "Documents"
				: (findRow(driveRows, id)?.node.name ?? "this folder"),
		[driveRows]
	)

	const reportError = useCallback(
		(error: unknown, action: string) => {
			logError(error, { action })
			toast.error("Something went wrong", getUserFriendlyErrorMessage(error))
		},
		[toast]
	)

	const downloadRows = useCallback(
		async (rows: DriveRow[]) => {
			const ids = collectDocumentIds(rows)
			if (ids.length === 0) return
			const namesById = new Map(
				rows
					.flatMap((row) => [row, ...collectAllRows(row.children ?? [])])
					.filter((row) => row.node.documentId)
					.map((row) => [row.node.documentId as string, row.node.name])
			)
			try {
				const urls = await convex.query(
					api.organizationDocuments.getDocumentUrls,
					{ ids }
				)
				let missing = 0
				for (const entry of urls) {
					if (!entry.url) {
						missing += 1
						continue
					}
					const anchor = document.createElement("a")
					anchor.href = entry.url
					anchor.download = namesById.get(entry.id as string) ?? "document"
					anchor.rel = "noopener"
					document.body.appendChild(anchor)
					anchor.click()
					anchor.remove()
				}
				if (missing > 0) {
					toast.error(
						"Some files unavailable",
						`${missing} ${missing === 1 ? "file" : "files"} could not be downloaded.`
					)
				}
			} catch (error) {
				reportError(error, "organizationDocuments.download")
			}
		},
		[convex, reportError, toast]
	)

	const handleRowAction = useCallback(
		(action: DriveRowAction, row: DriveRow) => {
			if (action === "details") {
				// Deferred a frame so the menu's dismiss cannot close the sheet.
				requestAnimationFrame(() => setDetailsTarget(row))
				return
			}
			if (action === "rename") {
				setNamePrompt({
					mode: "rename",
					targetId: row.id,
					currentName: row.node.name,
				})
				return
			}
			if (action === "remove") {
				setDeleteTarget(row)
				return
			}
			if (action === "move") {
				setMoveDestId(DRIVE_ROOT_ID)
				setMoveParentId(parentOf(row.id))
				setMoveTarget(row)
				return
			}
			void downloadRows([row])
		},
		[parentOf, downloadRows]
	)

	// ── Uploads ──

	/**
	 * In-flight uploads keyed by a local id. The row itself appears through the
	 * live query the moment the create mutation lands; this record tracks only
	 * the transfer: progress while it runs, an error the user can retry, or a
	 * settled entry the panel can list.
	 */
	const [uploads, setUploads] = useState<Record<string, UploadRecord>>({})
	const [uploadPanelCollapsed, setUploadPanelCollapsed] = useState(false)
	const uploadFilesRef = useRef(
		new Map<string, { file: File; folderId?: Id<"organizationDocumentFolders"> }>()
	)
	const uploadAbortsRef = useRef(new Map<string, () => void>())
	const uploadCounter = useRef(0)

	/** Upload ids already ingested from the picker hook, so a re-emit cannot duplicate. */
	const ingestedUploadIds = useRef<Set<string>>(new Set())

	const patchUpload = useCallback((id: string, patch: Partial<UploadRecord>) => {
		setUploads((current) =>
			current[id] ? { ...current, [id]: { ...current[id], ...patch } } : current
		)
	}, [])

	const runTransfer = useCallback(
		async (id: string) => {
			const entry = uploadFilesRef.current.get(id)
			if (!entry) return
			try {
				const uploadUrl = await generateUploadUrl()
				const storageId = await uploadToStorage(
					uploadUrl,
					entry.file,
					(percent) => patchUpload(id, { progress: percent }),
					(abort) => uploadAbortsRef.current.set(id, abort)
				)
				await createDocument({
					name: entry.file.name,
					storageId,
					folderId: entry.folderId,
				})
				patchUpload(id, { progress: 100, status: "done" })
			} catch (error) {
				// Cancelled transfers were already removed from the panel.
				if (uploadFilesRef.current.has(id)) {
					logError(error, { action: "organizationDocuments.upload" })
					patchUpload(id, { status: "error" })
				}
			} finally {
				uploadAbortsRef.current.delete(id)
			}
		},
		[generateUploadUrl, createDocument, patchUpload]
	)

	const startUploads = useCallback(
		(files: File[], folderId?: Id<"organizationDocumentFolders">) => {
			for (const file of files) {
				uploadCounter.current += 1
				const id = `upl-${uploadCounter.current}`
				uploadFilesRef.current.set(id, { file, folderId })
				setUploads((current) => ({
					...current,
					[id]: {
						name: file.name,
						sizeBytes: file.size,
						progress: 0,
						status: "uploading",
					},
				}))
				void runTransfer(id)
			}
			setUploadPanelCollapsed(false)
		},
		[runTransfer]
	)

	const cancelUpload = useCallback((id: string) => {
		if (id.startsWith("rejected-")) {
			clearUploadErrors()
			return
		}
		uploadFilesRef.current.delete(id)
		uploadAbortsRef.current.get(id)?.()
		uploadAbortsRef.current.delete(id)
		setUploads((current) => {
			const { [id]: removed, ...rest } = current
			return removed ? rest : current
		})
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	const retryUpload = useCallback(
		(id: string) => {
			patchUpload(id, { progress: 0, status: "uploading" })
			void runTransfer(id)
		},
		[patchUpload, runTransfer]
	)

	// The hook owns only the picker and the drag state; the live query stays
	// the one source of truth for what exists.
	const [
		{ isDragging, errors: uploadErrors },
		{
			clearErrors: clearUploadErrors,
			openFileDialog,
			getInputProps,
			handleDragEnter,
			handleDragLeave,
			handleDragOver,
			handleDrop,
		},
	] = useFileUpload({
		multiple: true,
		maxSize: UPLOAD_MAX_SIZE,
		accept: UPLOAD_ACCEPT,
		onFilesChange: (incoming) => {
			// The hook keeps its own accumulating list and re-emits it, so
			// ingesting `incoming` wholesale would upload the same drop twice.
			const fresh = incoming.filter(
				(entry) => !ingestedUploadIds.current.has(entry.id)
			)
			if (fresh.length === 0) return
			fresh.forEach((entry) => ingestedUploadIds.current.add(entry.id))

			const files = fresh
				.map((entry) => entry.file)
				.filter((file): file is File => file instanceof File)
			if (files.length === 0) return

			startUploads(files, currentFolderConvexId)
			// A scope view filters by a property a brand new file has not earned
			// yet, so land the user in the folder it actually went into.
			if (effectiveSelection.type !== "folder") {
				setSelection({ type: "folder", id: currentFolderId })
			}
		},
	})

	// The hook rejects files that break accept/maxSize before they ever reach
	// onFilesChange; surface them as failed rows in the same panel that
	// reports every other transfer.
	const rejectedEntries = useMemo<UploadEntry[]>(
		() =>
			uploadErrors.map((message, index) => ({
				id: `rejected-${index}`,
				name: message,
				sizeBytes: 0,
				progress: 100,
				status: "rejected" as const,
			})),
		[uploadErrors]
	)

	const uploadEntries = useMemo<UploadEntry[]>(
		() => [
			...Object.entries(uploads).map(([id, record]) => ({ id, ...record })),
			...rejectedEntries,
		],
		[uploads, rejectedEntries]
	)

	// Closing is only allowed to drop settled rows: a transfer still running
	// must keep its cancel control reachable rather than hiding behind an X.
	const closeUploadPanel = useCallback(() => {
		clearUploadErrors()
		setUploads((current) => {
			const next: Record<string, UploadRecord> = {}
			for (const [id, record] of Object.entries(current)) {
				if (record.status === "uploading") next[id] = record
				else uploadFilesRef.current.delete(id)
			}
			return next
		})
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// ── Table ──

	const columns = useMemo(
		() =>
			createDriveColumns({
				onOpen: handleOpen,
				onAction: handleRowAction,
				canModify,
				canDelete,
			}),
		[handleOpen, handleRowAction, canModify, canDelete]
	)

	// No pager: the surface scrolls, so one page always holds every file.
	const pagination = useMemo(
		() => ({ pageIndex: 0, pageSize: Math.max(filteredRows.length, 1) }),
		[filteredRows]
	)

	const table = useReactTable({
		data: filteredRows,
		columns,
		getRowId: (row) => row.id,
		state: { sorting, pagination, rowSelection, columnVisibility },
		enableRowSelection: true,
		onSortingChange: setSorting,
		onRowSelectionChange: setRowSelection,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
	})

	// The grid renders the table's row model, not the raw rows, so sorting and
	// filtering read identically in both views.
	const pageRows = table.getRowModel().rows.map((row) => row.original)

	const selectedIds = useMemo(
		() => new Set(Object.keys(rowSelection).filter((id) => rowSelection[id])),
		[rowSelection]
	)

	const selectedRows = useMemo(
		() => collectAllRows(driveRows).filter((row) => selectedIds.has(row.id)),
		[selectedIds, driveRows]
	)

	const selectionSummary = useMemo(
		() => ({
			count: selectedRows.length,
			bytes: selectedRows.reduce((sum, row) => sum + row.sizeBytes, 0),
		}),
		[selectedRows]
	)

	const breadcrumb = useMemo(() => {
		if (effectiveSelection.type === "scope") {
			return [
				{ id: DRIVE_ROOT_ID, label: "Documents" },
				{ id: "recent", label: "Recent" },
			]
		}

		return getFolderPath(driveRows, effectiveSelection.id).map((id) => ({
			id,
			label:
				id === DRIVE_ROOT_ID
					? "Documents"
					: (findRow(driveRows, id)?.node.name ?? "Folder"),
		}))
	}, [effectiveSelection, driveRows])

	const allFiles = useMemo(() => collectFiles(driveRows), [driveRows])
	const usedBytes = useMemo(
		() => allFiles.reduce((sum, row) => sum + row.sizeBytes, 0),
		[allFiles]
	)

	function handleCardSelectChange(row: DriveRow, next: boolean) {
		setRowSelection((prev) => {
			const draft = { ...prev }
			if (next) draft[row.id] = true
			else delete draft[row.id]
			return draft
		})
	}

	function toggleProperty(property: DriveProperty) {
		setViewPrefs((current) => ({
			...current,
			visibleProperties: {
				...current.visibleProperties,
				[property]: !current.visibleProperties[property],
			},
		}))
	}

	function clearFilters() {
		setSearch("")
		setKindFilter("all")
	}

	function handleFolderAction(action: FolderAction, folderId: string) {
		if (action === "new") {
			setNamePrompt({
				mode: "create",
				parentId: folderId,
				parentLabel: labelFor(folderId),
			})
			return
		}
		// The drive root is a synthetic tree node with no entry in the data.
		const target = findRow(driveRows, folderId)
		if (!target) return
		if (action === "rename") {
			setNamePrompt({
				mode: "rename",
				targetId: folderId,
				currentName: target.node.name,
			})
			return
		}
		if (action === "move") {
			setMoveDestId(DRIVE_ROOT_ID)
			setMoveParentId(parentOf(folderId))
			setMoveTarget(target)
			return
		}
		setDeleteTarget(target)
	}

	async function submitName(name: string) {
		if (!namePrompt) return
		const prompt = namePrompt
		setNamePrompt(null)

		try {
			if (prompt.mode === "create") {
				await createFolder({
					name,
					parentId:
						prompt.parentId === DRIVE_ROOT_ID
							? undefined
							: (prompt.parentId as Id<"organizationDocumentFolders">),
				})
				if (effectiveSelection.type !== "folder") {
					setSelection({ type: "folder", id: prompt.parentId })
				}
				toast.success(`${name} created`)
			} else {
				const target = findRow(driveRows, prompt.targetId)
				if (!target) return
				if (target.node.kind === "folder") {
					await renameFolder({ id: target.node.folderId!, name })
				} else {
					await updateDocument({ id: target.node.documentId!, name })
				}
				toast.success(`Renamed to ${name}`)
			}
		} catch (error) {
			reportError(error, "organizationDocuments.name")
		}
	}

	/** Counts for the folder-delete confirm, from the already-derived tree. */
	function deleteImpactOf(rows: DriveRow[]) {
		const all = rows.flatMap((row) => [row, ...collectAllRows(row.children ?? [])])
		return {
			folderCount: all.filter((row) => row.node.kind === "folder").length,
			documentCount: all.filter((row) => row.node.kind !== "folder").length,
		}
	}

	async function deleteRows(rows: DriveRow[]) {
		const folderIds = rows
			.filter((row) => row.node.kind === "folder")
			.map((row) => row.node.folderId!)
		const documentIds = rows
			.filter((row) => row.node.kind !== "folder")
			.map((row) => row.node.documentId!)

		try {
			// Sequential on purpose: folder removal cascades server-side, and the
			// row lists here are always sibling rows so the two sets are disjoint.
			for (const id of folderIds) {
				await removeFolder({ id })
			}
			if (documentIds.length > 0) {
				await bulkRemoveDocuments({ ids: documentIds })
			}
			const total = rows.length
			toast.success(
				total === 1
					? `${rows[0].node.name} deleted`
					: `${formatCount(total)} items deleted`
			)
		} catch (error) {
			reportError(error, "organizationDocuments.delete")
		}
	}

	async function confirmDelete() {
		if (!deleteTarget) return
		const target = deleteTarget
		setDeleteTarget(null)
		// Deleting the open folder (or an ancestor of it) strands the view.
		if (
			effectiveSelection.type === "folder" &&
			getFolderPath(driveRows, effectiveSelection.id).includes(target.id)
		) {
			setSelection({ type: "folder", id: DRIVE_ROOT_ID })
		}
		setRowSelection({})
		await deleteRows([target])
	}

	async function confirmBulkDelete() {
		setBulkDeleteOpen(false)
		const rows = selectedRows
		setRowSelection({})
		await deleteRows(rows)
	}

	// A folder cannot move into itself or anything beneath it.
	const moveBlocked = useMemo(
		() =>
			new Set(
				moveTarget
					? [moveTarget.id, ...collectAllRows(moveTarget.children ?? []).map((row) => row.id)]
					: []
			),
		[moveTarget]
	)

	async function confirmMove() {
		if (!moveTarget) return
		const target = moveTarget
		setMoveTarget(null)
		const destFolderId =
			moveDestId === DRIVE_ROOT_ID
				? undefined
				: (moveDestId as Id<"organizationDocumentFolders">)
		try {
			if (target.node.kind === "folder") {
				await moveFolder({ id: target.node.folderId!, parentId: destFolderId })
			} else {
				await moveDocuments({
					ids: [target.node.documentId!],
					folderId: destFolderId,
				})
			}
			toast.success(`${target.node.name} moved to ${labelFor(moveDestId)}`)
		} catch (error) {
			reportError(error, "organizationDocuments.move")
		}
	}

	async function saveDetails(patch: { name: string; description?: string }) {
		if (!detailsTarget) return
		const target = detailsTarget
		try {
			if (target.node.kind === "folder") {
				await renameFolder({ id: target.node.folderId!, name: patch.name })
			} else {
				await updateDocument({
					id: target.node.documentId!,
					name: patch.name,
					description: patch.description,
				})
			}
			toast.success("Changes saved")
			setDetailsTarget(null)
		} catch (error) {
			reportError(error, "organizationDocuments.update")
		}
	}

	// Signed URL for the details sheet's preview and open/download actions.
	const detailsUrl = useQuery(
		api.organizationDocuments.getDocumentUrl,
		detailsTarget?.node.documentId ? { id: detailsTarget.node.documentId } : "skip"
	)

	const rail = (
		<FolderTree
			key={folderSignature}
			rows={driveRows}
			selection={effectiveSelection}
			usedBytes={usedBytes}
			fileCount={allFiles.length}
			canModify={canModify}
			canDelete={canDelete}
			onSelect={goTo}
			onFolderAction={handleFolderAction}
			expandedItems={expandedFolderIds}
			onExpandedChange={setExpandedFolderIds}
			className="h-full"
		/>
	)

	if (isLoading) {
		return (
			<Card className="h-full min-h-0 w-full gap-0! overflow-hidden p-0!">
				<CardContent className="flex min-h-0 flex-1 p-0!">
					<div className="border-border hidden w-64 shrink-0 flex-col gap-2 border-e p-4 lg:flex">
						{Array.from({ length: 6 }, (_, index) => (
							<Skeleton key={index} className="h-7 w-full" />
						))}
					</div>
					<div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
						<div className="flex items-center justify-between gap-3">
							<Skeleton className="h-8 w-44" />
							<Skeleton className="h-8 w-64" />
						</div>
						{Array.from({ length: 8 }, (_, index) => (
							<Skeleton key={index} className="h-9 w-full" />
						))}
					</div>
				</CardContent>
			</Card>
		)
	}

	return (
		<DataGrid
			table={table}
			recordCount={filteredRows.length}
			tableLayout={{
				dense: density === "compact",
				columnsResizable: false,
				columnsVisibility: false,
				rowBorder: true,
			}}
			tableClassNames={{
				bodyRow: "group/row",
				edgeCell: "first:ps-4 last:pe-4",
			}}
		>
			<Card className="relative h-full min-h-0 w-full gap-0! overflow-hidden p-0!">
				{/* Docked over the drive, inside the block's own card so it never
				    escapes into the page chrome the way a `fixed` panel would. */}
				<UploadPanel
					entries={uploadEntries}
					collapsed={uploadPanelCollapsed}
					onToggleCollapsed={() => setUploadPanelCollapsed((open) => !open)}
					onClose={closeUploadPanel}
					onCancel={cancelUpload}
					onRetry={retryUpload}
				/>
				<CardContent className="flex min-h-0 flex-1 flex-col p-0!">
					{/* Header */}
					<div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
						<div className="flex min-w-0 flex-col gap-0.5">
							<h2 className="text-foreground text-base leading-none font-semibold">
								Documents
							</h2>
							<p className="text-muted-foreground truncate text-xs max-sm:hidden">
								Your team&apos;s shared file library. PDFs can be attached
								to quotes and invoices.
							</p>
						</div>
						{/* Below sm the two actions would squeeze the title to an
						    ellipsis, so the labels drop and the buttons become icons. */}
						{canModify ? (
							<div className="flex shrink-0 items-center gap-2">
								<Button
									type="button"
									variant="outline"
									onClick={() => handleFolderAction("new", currentFolderId)}
								>
									{TOOLBAR_ICONS.folderPlus}
									<span className="max-sm:sr-only">New Folder</span>
								</Button>
								<Button type="button" onClick={openFileDialog}>
									{TOOLBAR_ICONS.upload}
									<span className="max-sm:sr-only">Upload</span>
								</Button>
							</div>
						) : null}
					</div>

					<div className="flex min-h-0 flex-1 flex-col lg:flex-row">
						{/* Folder rail */}
						<aside className="border-border hidden w-64 shrink-0 border-e lg:flex lg:flex-col">
							{rail}
						</aside>

						{/* Browse panel */}
						<div className="flex min-h-0 min-w-0 flex-1 flex-col">
							{/* Toolbar */}
							<div className="flex min-w-0 shrink-0 flex-col gap-2 px-4 py-2.5 lg:flex-row lg:items-center">
								{/* Path */}
								<div className="flex min-w-0 items-center gap-2 lg:me-auto">
									<Sheet open={railOpen} onOpenChange={setRailOpen}>
										<SheetTrigger
											render={
												<Button
													type="button"
													variant="outline"
													size="icon"
													className="shrink-0 lg:hidden"
													aria-label="Open navigation"
												>
													{TOOLBAR_ICONS.menu}
												</Button>
											}
										/>
										<SheetContent side="left" className="w-72 p-0">
											<SheetHeader className="border-b">
												<SheetTitle>Documents</SheetTitle>
												<SheetDescription>
													Pick a folder or a saved view
												</SheetDescription>
											</SheetHeader>
											<div className="min-h-0 flex-1">{rail}</div>
										</SheetContent>
									</Sheet>

									<Breadcrumb className="min-w-0">
										<BreadcrumbList className="flex-nowrap">
											{breadcrumb.map((crumb, index) => {
												const last = index === breadcrumb.length - 1

												// Separator is a sibling <li>, never nested inside
												// the item: an <li> inside an <li> is invalid and
												// hydrates differently on the client.
												return (
													<Fragment key={crumb.id}>
														<BreadcrumbItem className="min-w-0">
															{last ? (
																<BreadcrumbPage className="truncate">
																	{crumb.label}
																</BreadcrumbPage>
															) : (
																<BreadcrumbLink
																	render={
																		<button
																			type="button"
																			className="truncate"
																			onClick={() =>
																				goTo({ type: "folder", id: crumb.id })
																			}
																		>
																			{crumb.label}
																		</button>
																	}
																/>
															)}
														</BreadcrumbItem>
														{last ? null : <BreadcrumbSeparator />}
													</Fragment>
												)
											})}
										</BreadcrumbList>
									</Breadcrumb>
								</div>

								{/* Controls */}
								<div className="flex min-w-0 flex-wrap items-center gap-2 lg:flex-nowrap">
									<InputGroup className="w-full lg:w-56">
										<InputGroupAddon>{TOOLBAR_ICONS.search}</InputGroupAddon>
										<InputGroupInput
											value={search}
											onChange={(event) => setSearch(event.target.value)}
											placeholder="Search documents"
											aria-label="Search documents"
										/>
									</InputGroup>

									<OptionSelect
										value={kindFilter}
										options={[
											{ value: "all" as const, label: "All types" },
											...FILE_KIND_OPTIONS,
										]}
										ariaLabel="Filter by type"
										size="default"
										className="flex-1 lg:w-[132px] lg:flex-none"
										onChange={(next) => setKindFilter(next)}
									/>

									<ToggleGroup
										multiple={false}
										spacing={0}
										value={[viewMode]}
										onValueChange={(next: string[]) => {
											// Deselecting the active item yields [], which would
											// leave the browse surface with no view at all.
											const mode = next[0] as DriveViewMode | undefined
											if (mode) setViewPrefs((current) => ({ ...current, viewMode: mode }))
										}}
										variant="outline"
										size="default"
										aria-label="Browse view"
										className="shrink-0"
									>
										<ToggleGroupItem value="list" aria-label="List view">
											{TOOLBAR_ICONS.list}
										</ToggleGroupItem>
										<ToggleGroupItem value="grid" aria-label="Grid view">
											{TOOLBAR_ICONS.grid}
										</ToggleGroupItem>
									</ToggleGroup>

									<ViewSettings
										density={density}
										sortKey={sortKeyFromSorting(sorting)}
										visibleProperties={visibleProperties}
										onDensityChange={(next) =>
											setViewPrefs((current) => ({ ...current, density: next }))
										}
										onSortChange={(next) => {
											// "custom" names a header-click state, not a preset;
											// committing it would set sorting to undefined.
											const preset = SORT_STATES[next]
											if (preset) setSorting(preset)
										}}
										onToggleProperty={toggleProperty}
									/>
								</div>
							</div>

							<Separator />

							{/* Selection */}
							{selectionSummary.count > 0 ? (
								<DriveSelectionBar
									selectedCount={selectionSummary.count}
									selectedBytes={selectionSummary.bytes}
									canDelete={canDelete}
									onDownload={() => void downloadRows(selectedRows)}
									onRemove={() => setBulkDeleteOpen(true)}
									onClear={() => setRowSelection({})}
								/>
							) : null}

							{/* Content: the one scroll owner, so the shell never grows.
							    The drop surface is the wrapper, not the scroller: an
							    overlay inside an `overflow-y-auto` element scrolls away
							    with the content. */}
							<div
								className="relative flex min-h-0 flex-1 flex-col"
								onDragEnter={canModify ? handleDragEnter : undefined}
								onDragLeave={canModify ? handleDragLeave : undefined}
								onDragOver={canModify ? handleDragOver : undefined}
								onDrop={canModify ? handleDrop : undefined}
							>
								<input {...getInputProps()} className="sr-only" tabIndex={-1} />
								{isDragging ? (
									<div
										aria-hidden="true"
										className="border-primary bg-background/80 pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-lg border border-dashed backdrop-blur-[2px]"
									>
										<span className="flex flex-col items-center gap-2 text-center">
											<span className="border-primary/40 bg-primary/10 text-primary flex size-11 items-center justify-center rounded-full border border-dashed [&_svg]:size-5">
												{TOOLBAR_ICONS.dropzone}
											</span>
											<span className="text-foreground text-sm font-medium">
												Drop files to upload
											</span>
											<span className="text-muted-foreground text-xs">
												They land in{" "}
												{breadcrumb[breadcrumb.length - 1]?.label ??
													"this folder"}
											</span>
										</span>
									</div>
								) : null}
								<ScrollArea className="min-h-0 flex-1">
									{isDriveEmpty && !hasFilters ? (
										<div className="flex h-full w-full items-center justify-center px-4 py-10">
											<EmptyState
												illustration="documents-none"
												title="No documents yet"
												description="Upload PDFs, images, and other files to build your team's shared library."
												action={
													<div className="flex flex-col items-center gap-2">
														{canModify ? (
															<Button type="button" onClick={openFileDialog}>
																{TOOLBAR_ICONS.upload}
																Upload Files
															</Button>
														) : null}
														<LearnMoreLink article="settings-and-team/documents-and-skus" />
													</div>
												}
											/>
										</div>
									) : isEmpty ? (
										<DriveEmptyState
											filtered={hasFilters}
											canUpload={canModify}
											onClearFilters={clearFilters}
											onUpload={openFileDialog}
										/>
									) : (
										<div className="flex flex-col gap-5 pt-3 pb-4">
											<FolderBand folders={suggestedFolders} onOpen={handleOpen} />

											<div className="flex flex-col gap-2">
												{isDriveRoot && suggestedFolders.length > 0 ? (
													<p className="text-muted-foreground px-4 text-xs font-medium">
														Files
													</p>
												) : null}

												{viewMode === "grid" ? (
													<FileCardGrid
														rows={pageRows}
														visibleProperties={visibleProperties}
														selectedIds={selectedIds}
														onOpen={handleOpen}
														onSelectChange={handleCardSelectChange}
													/>
												) : (
													<DataGridScrollArea>
														<DataGridTable />
													</DataGridScrollArea>
												)}
											</div>
										</div>
									)}
								</ScrollArea>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>

			<NameDialog
				prompt={namePrompt}
				onSubmit={(name) => void submitName(name)}
				onOpenChange={(open) => {
					if (!open) setNamePrompt(null)
				}}
			/>
			<MoveDialog
				open={moveTarget !== null}
				targetId={moveTarget?.id ?? ""}
				targetName={moveTarget?.node.name ?? ""}
				rows={driveRows}
				destId={moveDestId}
				currentParent={labelFor(moveParentId)}
				destPath={getFolderPath(driveRows, moveDestId).map(labelFor)}
				disabledIds={moveBlocked}
				onDest={setMoveDestId}
				destPathOf={(id) => getFolderPath(driveRows, id).map(labelFor)}
				onConfirm={() => void confirmMove()}
				onOpenChange={(open: boolean) => {
					if (!open) setMoveTarget(null)
				}}
			/>
			<DetailsSheet
				target={detailsTarget}
				url={detailsUrl}
				locationLabel={
					detailsTarget
						? getFolderPath(driveRows, parentOf(detailsTarget.id))
								.map(labelFor)
								.join(" / ")
						: ""
				}
				canModify={canModify}
				onOpenChange={(open) => {
					if (!open) setDetailsTarget(null)
				}}
				onSave={(patch) => void saveDetails(patch)}
				onDownload={(row) => void downloadRows([row])}
			/>
			<DeleteDialog
				open={deleteTarget !== null}
				targetLabel={deleteTarget?.node.name ?? "This item"}
				impact={
					deleteTarget?.node.kind === "folder"
						? deleteImpactOf(deleteTarget.children ?? [])
						: undefined
				}
				onConfirm={() => void confirmDelete()}
				onOpenChange={(open) => {
					if (!open) setDeleteTarget(null)
				}}
			/>
			<DeleteDialog
				open={bulkDeleteOpen}
				targetLabel={`${formatCount(selectionSummary.count)} items`}
				impact={deleteImpactOf(
					selectedRows.flatMap((row) => row.children ?? [])
				)}
				onConfirm={() => void confirmBulkDelete()}
				onOpenChange={setBulkDeleteOpen}
			/>
		</DataGrid>
	)
}
