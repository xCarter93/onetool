import { Fragment, useMemo } from "react"
import { Tree, TreeItem, TreeItemLabel } from "@/components/reui/tree"
import {
	hotkeysCoreFeature,
	selectionFeature,
	syncDataLoaderFeature,
} from "@headless-tree/core"
import { useTree } from "@headless-tree/react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { DRIVE_ROOT_ID, formatBytes, formatCount, type DriveRow } from "./data"
import { FolderPlusIcon, PencilIcon, FolderIcon, Trash2Icon, ClockIcon } from "lucide-react"

export const TREE_ROOT_ID = "drive-tree-root"
export const TREE_INDENT = 20

export type DriveScope = "recent"

/** Folder operations offered from the rail's right-click menu. */
export type FolderAction = "new" | "rename" | "move" | "delete"

/** What the browse panel is currently showing. */
export type DriveSelection =
	| { type: "folder"; id: string }
	| { type: "scope"; id: DriveScope }

export interface FolderTreeNode {
	name: string
	children?: string[]
	/** Derived Clients-tree folder: system-managed, so no actions apply. */
	virtual?: boolean
}

// prettier-ignore
const FOLDER_ACTIONS: { id: FolderAction; label: string; icon: React.ReactNode; separated?: boolean; destructive?: boolean; needsModify?: boolean; needsDelete?: boolean }[] = [
	{ id: "new", label: "New Folder", needsModify: true, icon: <FolderPlusIcon aria-hidden="true" /> },
	{ id: "rename", label: "Rename", needsModify: true, icon: <PencilIcon aria-hidden="true" /> },
	{ id: "move", label: "Move", needsModify: true, icon: <FolderIcon aria-hidden="true" /> },
	{ id: "delete", label: "Delete", separated: true, destructive: true, needsDelete: true, icon: <Trash2Icon aria-hidden="true" /> },
]

/** Flattens the row tree into the loader's id to node map, folders only. */
export function buildFolderNodes(rows: DriveRow[]) {
	const map: Record<string, FolderTreeNode> = {
		[TREE_ROOT_ID]: { name: "Documents", children: [DRIVE_ROOT_ID] },
		[DRIVE_ROOT_ID]: { name: "All documents", children: [] },
	}

	function walk(current: DriveRow[], parentId: string) {
		for (const row of current) {
			if (row.node.kind !== "folder") continue

			map[row.id] = {
				name: row.node.name,
				children: [],
				virtual: row.node.source !== undefined,
			}
			map[parentId].children?.push(row.id)

			if (row.children) walk(row.children, row.id)
		}
	}

	walk(rows, DRIVE_ROOT_ID)
	return map
}

export function FolderTree({
	rows,
	selection,
	usedBytes,
	fileCount,
	canModify,
	canDelete,
	onSelect,
	onFolderAction,
	expandedItems,
	onExpandedChange,
	className,
}: {
	rows: DriveRow[]
	selection: DriveSelection
	usedBytes: number
	fileCount: number
	canModify: boolean
	canDelete: boolean
	onSelect: (next: DriveSelection) => void
	onFolderAction: (action: FolderAction, folderId: string) => void
	expandedItems: string[]
	onExpandedChange: (next: string[]) => void
	className?: string
}) {
	const folderNodes = useMemo(() => buildFolderNodes(rows), [rows])

	const activeFolderId = selection.type === "folder" ? selection.id : ""

	const tree = useTree<FolderTreeNode>({
		state: { selectedItems: [activeFolderId], expandedItems },
		setSelectedItems: (updater) => {
			const next =
				typeof updater === "function" ? updater([activeFolderId]) : updater
			const nextId = next[0]
			if (nextId && folderNodes[nextId]) {
				onSelect({ type: "folder", id: nextId })
			}
		},
		setExpandedItems: (updater) =>
			onExpandedChange(
				typeof updater === "function" ? updater(expandedItems) : updater
			),
		indent: TREE_INDENT,
		rootItemId: TREE_ROOT_ID,
		getItemName: (item) => item.getItemData().name,
		isItemFolder: (item) => (item.getItemData().children?.length ?? 0) > 0,
		dataLoader: {
			getItem: (itemId) => folderNodes[itemId],
			getChildren: (itemId) => folderNodes[itemId]?.children ?? [],
		},
		features: [syncDataLoaderFeature, selectionFeature, hotkeysCoreFeature],
	})

	return (
		<div className={cn("flex min-h-0 min-w-0 flex-col", className)}>
			{/* Main nav: the folder tree owns the rail's scroll */}
			<ScrollArea className="min-h-0 flex-1">
				<div className="p-2">
					<Tree indent={TREE_INDENT} tree={tree} className="w-full gap-0.5">
						{tree.getItems().map((item) => {
							const visibleActions = (
								item.getItemData().virtual
									? []
									: item.getId() === DRIVE_ROOT_ID
										? FOLDER_ACTIONS.filter((action) => action.id === "new")
										: FOLDER_ACTIONS
							).filter(
								(action) =>
									!(action.needsModify && !canModify) &&
									!(action.needsDelete && !canDelete)
							)

							const treeItem = (
								<TreeItem item={item} className="block w-full">
									<TreeItemLabel className="in-data-[selected=true]:bg-accent w-full bg-transparent px-2 py-2">
										<span className="flex size-4 shrink-0 items-center justify-center [&_svg]:size-4">
											{/* prettier-ignore */}
											<FolderIcon aria-hidden="true" />
										</span>
										<span className="min-w-0 truncate">{item.getItemName()}</span>
									</TreeItemLabel>
								</TreeItem>
							)

							// A member with view-only access gets no context menu at all
							// rather than an empty one.
							if (visibleActions.length === 0) {
								return <Fragment key={item.getId()}>{treeItem}</Fragment>
							}

							return (
								<ContextMenu key={item.getId()}>
									<ContextMenuTrigger className="block w-full">
										{treeItem}
									</ContextMenuTrigger>
									<ContextMenuContent className="w-44">
										{visibleActions.map((action) => (
											<Fragment key={action.id}>
												{action.separated ? <ContextMenuSeparator /> : null}
												<ContextMenuItem
													variant={action.destructive ? "destructive" : undefined}
													onClick={() => onFolderAction(action.id, item.getId())}
												>
													{action.icon}
													{action.label}
												</ContextMenuItem>
											</Fragment>
										))}
									</ContextMenuContent>
								</ContextMenu>
							)
						})}
					</Tree>
				</div>
			</ScrollArea>

			<Separator />

			{/* Secondary links */}
			<div className="flex shrink-0 flex-col gap-0.5 p-2">
				<Button
					type="button"
					variant={
						selection.type === "scope" && selection.id === "recent"
							? "secondary"
							: "ghost"
					}
					className="h-8 w-full justify-start gap-2 px-2 font-normal"
					aria-pressed={selection.type === "scope" && selection.id === "recent"}
					onClick={() => onSelect({ type: "scope", id: "recent" })}
				>
					<ClockIcon aria-hidden="true" />
					Recent
				</Button>
			</div>

			<Separator />

			{/* Storage: usage only — org documents carry no quota. */}
			<div className="flex shrink-0 flex-col gap-1 p-3">
				<span className="text-foreground text-xs font-medium">Storage</span>
				<p className="text-muted-foreground text-xs tabular-nums">
					{formatBytes(usedBytes)} across {formatCount(fileCount)}{" "}
					{fileCount === 1 ? "file" : "files"}
				</p>
			</div>
		</div>
	)
}
