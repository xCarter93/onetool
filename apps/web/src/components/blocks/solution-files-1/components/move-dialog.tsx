"use client"

// Destination picker. Follows a drive's move dialog but fixes the parts that
// make those slow: the resolved destination path is shown live instead of
// "select a location to see the path", and destinations that would orphan the
// item are disabled in place with the reason rather than failing on confirm.
// Search is on demand from the right of the tab row and takes the row over
// while it is open, so the list keeps one fixed height in every state.
import { useMemo, useRef, useState } from "react"
import { Badge } from "@/components/reui/badge"
import { IconStack } from "@/components/reui/icon-stack"
import {
  Tree,
  TreeItem,
  TreeItemLabel,
} from "@/components/reui/tree"
import {
  hotkeysCoreFeature,
  selectionFeature,
  syncDataLoaderFeature,
} from "@headless-tree/core"
// Compiler entrypoint: see folder-tree.tsx — the plain one leaves the tree
// empty under React Compiler until an unrelated re-render.
import { useTree } from "@headless-tree/react/react-compiler"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { collectAllRows, type DriveRow } from "./data"
import {
  buildFolderNodes,
  TREE_INDENT,
  TREE_ROOT_ID,
  type FolderTreeNode,
} from "./folder-tree"
import { FolderIcon, SearchIcon, CheckIcon, XIcon } from "lucide-react"

/** Shared description for tree rows the move can't target. */
const BLOCKED_HINT_ID = "move-dialog-blocked-hint"

// prettier-ignore
const ICONS = {
  folder: <FolderIcon aria-hidden="true" />,
  search: <SearchIcon aria-hidden="true" />,
  check: <CheckIcon className="size-4" aria-hidden="true" />,
  close: <XIcon aria-hidden="true" />,
}

// prettier-ignore
const SEARCH_EMPTY_ICONS = {
  prompt: <SearchIcon strokeWidth="1.9" />,
  none: <FolderIcon strokeWidth="1.9" />,
}

/** Both search states share one shape so the list never changes height. */
function SearchEmpty({
  query,
  onClear,
}: {
  query: string
  onClear: () => void
}) {
  const idle = query === ""

  return (
    <div className="flex h-full w-full items-center justify-center px-6">
      <Empty className="text-foreground max-w-xs flex-none gap-4 border-0 bg-transparent p-0">
        <EmptyHeader className="items-center gap-3 text-center">
          <EmptyMedia className="mb-0">
            <IconStack className="h-14 w-12" aria-hidden="true">
              {idle ? SEARCH_EMPTY_ICONS.prompt : SEARCH_EMPTY_ICONS.none}
            </IconStack>
          </EmptyMedia>
          <EmptyTitle className="text-sm">
            {idle ? "Search Locations" : "No Matches"}
          </EmptyTitle>
          <EmptyDescription className="text-xs">
            {idle
              ? "Type a folder name to jump straight to it."
              : `Nothing is named "${query}". Try a shorter word.`}
          </EmptyDescription>
        </EmptyHeader>
        {idle ? null : (
          <EmptyContent className="max-w-none items-center gap-0">
            <Button type="button" variant="outline" size="sm" onClick={onClear}>
              Clear Search
            </Button>
          </EmptyContent>
        )}
      </Empty>
    </div>
  )
}

/** Flat destination row, shared by Suggested, Starred and search results. */
function FolderRow({
  row,
  pathLabel,
  selected,
  blocked,
  isTarget,
  onSelect,
}: {
  row: DriveRow
  pathLabel: string
  selected: boolean
  blocked: boolean
  /** The item being moved, as opposed to one of its descendants. */
  isTarget: boolean
  onSelect: (id: string) => void
}) {
  return (
    <button
      type="button"
      disabled={blocked}
      aria-pressed={selected}
      onClick={() => onSelect(row.id)}
      className={cn(
        "hover:bg-accent flex w-full items-center gap-2.5 px-4 py-2 text-start",
        selected && "bg-muted",
        blocked && "pointer-events-none opacity-40"
      )}
    >
      <span className="text-muted-foreground flex size-4 shrink-0 items-center [&_svg]:size-4">
        {ICONS.folder}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm">{row.node.name}</span>
        <span className="text-muted-foreground truncate text-xs">
          {blocked
            ? isTarget
              ? "Cannot move into itself"
              : "Cannot move into its own subfolder"
            : pathLabel}
        </span>
      </span>
      {selected ? (
        <span className="text-primary shrink-0">{ICONS.check}</span>
      ) : null}
    </button>
  )
}

export function MoveDialog({
  open,
  targetId,
  targetName,
  currentParent,
  rows,
  destId,
  destPath,
  disabledIds,
  onDest,
  onConfirm,
  onOpenChange,
  destPathOf,
}: {
  open: boolean
  /** Row id of the item being moved, so its own row reads apart from its subtree. */
  targetId: string
  targetName: string
  currentParent: string
  rows: DriveRow[]
  destId: string
  /** Resolved labels from the drive root down to the chosen destination. */
  destPath: string[]
  /** The item itself plus its descendants: moving into them would orphan it. */
  disabledIds: ReadonlySet<string>
  onDest: (folderId: string) => void
  onConfirm: () => void
  onOpenChange: (open: boolean) => void
  /** Resolved label chain for any folder id, used for the row subtitles. */
  destPathOf: (id: string) => string[]
}) {
  const [query, setQuery] = useState("")
  // Controlled: search unmounts the tab list, which would otherwise commit a
  // null value and leave the tab area empty once search closes.
  const [tab, setTab] = useState("suggested")
  const [searching, setSearching] = useState(false)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const searchToggleRef = useRef<HTMLButtonElement | null>(null)
  const [expandedItems, setExpandedItems] = useState<string[]>([TREE_ROOT_ID])
  const folderNodes = useMemo(() => buildFolderNodes(rows), [rows])

  const allFolders = useMemo(
    () => collectAllRows(rows).filter((row) => row.node.kind === "folder"),
    [rows]
  )

  const search = query.trim().toLowerCase()
  const suggested = useMemo(
    () =>
      [...allFolders]
        .sort((a, b) => b.node.modifiedAt - a.node.modifiedAt)
        .slice(0, 8),
    [allFolders]
  )
  const matches = useMemo(
    () =>
      search
        ? allFolders.filter((row) =>
            row.node.name.toLowerCase().includes(search)
          )
        : [],
    [allFolders, search]
  )

  const tree = useTree<FolderTreeNode>({
    state: { selectedItems: [destId], expandedItems },
    setSelectedItems: (updater) => {
      const next = typeof updater === "function" ? updater([destId]) : updater
      const id = next[0]
      if (id && folderNodes[id] && !disabledIds.has(id)) onDest(id)
    },
    setExpandedItems: (updater) =>
      setExpandedItems((prev) =>
        typeof updater === "function" ? updater(prev) : updater
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

  function openSearch() {
    setSearching(true)
    // The row swaps in this tick, so focus has to wait for the input to exist.
    requestAnimationFrame(() => searchRef.current?.focus())
  }

  function closeSearch() {
    setSearching(false)
    setQuery("")
  }

  // Dismissing search from inside it (Escape, the Close button) unmounts the
  // focused element, which would drop focus to body. Hand it back to the toggle
  // that opened search. Not used on the dialog-close path, where focus belongs
  // to whatever opened the dialog.
  function dismissSearch() {
    closeSearch()
    requestAnimationFrame(() => searchToggleRef.current?.focus())
  }

  // Every close path resets search and the tab, not just the overlay/Escape one
  // the Dialog drives — Cancel used to leave both where the last visit left them.
  function handleOpenChange(next: boolean) {
    if (!next) {
      closeSearch()
      setTab("suggested")
    }
    onOpenChange(next)
  }

  function parentLabelOf(id: string) {
    const chain = destPathOf(id)
    return chain.length > 1 ? chain.slice(0, -1).join(" / ") : "Documents"
  }

  function renderList(list: DriveRow[], empty: string) {
    if (list.length === 0) {
      return (
        <p className="text-muted-foreground px-4 py-6 text-center text-xs">
          {empty}
        </p>
      )
    }
    return list.map((row) => (
      <FolderRow
        key={row.id}
        row={row}
        pathLabel={parentLabelOf(row.id)}
        selected={row.id === destId}
        blocked={disabledIds.has(row.id)}
        isTarget={row.id === targetId}
        onSelect={onDest}
      />
    ))
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 gap-3 p-4 pb-3">
          <DialogTitle className="truncate">Move {targetName}</DialogTitle>
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-muted-foreground shrink-0 text-xs">
              Current location
            </span>
            {/* Badge's own size-3 glyph and gap-1, not a custom pair: the
                14px icon made the chip read a size larger than standard. */}
            <Badge variant="outline" className="min-w-0">
              <span className="text-muted-foreground flex size-3 shrink-0 items-center [&_svg]:size-3">
                {ICONS.folder}
              </span>
              <span className="truncate">{currentParent}</span>
            </Badge>
          </div>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(next) => {
            if (next) setTab(next as string)
          }}
          className="flex flex-col"
        >
          {/* One 40px row in both states, so the border below it never moves
              and the dialog keeps its height when search opens. */}
          <div className="flex h-10 shrink-0 items-center gap-1 border-b px-4">
            {searching ? (
              <>
                <span className="text-muted-foreground flex size-4 shrink-0 items-center [&_svg]:size-4">
                  {ICONS.search}
                </span>
                <Input
                  ref={searchRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      // Swallow it: Escape would otherwise close the dialog.
                      event.preventDefault()
                      event.stopPropagation()
                      dismissSearch()
                    }
                  }}
                  placeholder="Search folders"
                  aria-label="Search folders"
                  autoComplete="off"
                  className="h-full! min-w-0 flex-1 rounded-none! border-0! bg-transparent! px-2! text-sm! shadow-none! ring-0!"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0"
                  aria-label="Close search"
                  onClick={dismissSearch}
                >
                  {ICONS.close}
                </Button>
              </>
            ) : (
              <>
                {/* Line tabs seat ON the row's border: zero the list padding,
                    full-height triggers, underline on the border's own pixel. */}
                <TabsList
                  variant="line"
                  className="h-full! min-w-0 flex-1 justify-start gap-4 p-0!"
                >
                  <TabsTrigger
                    value="suggested"
                    className="h-full! flex-none after:-bottom-px!"
                  >
                    Suggested
                  </TabsTrigger>
                  <TabsTrigger
                    value="all"
                    className="h-full! flex-none after:-bottom-px!"
                  >
                    All Locations
                  </TabsTrigger>
                </TabsList>
                <Button
                  ref={searchToggleRef}
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0"
                  aria-label="Search folders"
                  onClick={openSearch}
                >
                  {ICONS.search}
                </Button>
              </>
            )}
          </div>

          {/* Fixed height on purpose: a content-sized list makes the dialog
              jump every time you switch tabs or type in search. */}
          <div className="h-72 shrink-0 overflow-y-auto">
            {searching ? (
              matches.length === 0 ? (
                <SearchEmpty
                  query={query.trim()}
                  onClear={() => setQuery("")}
                />
              ) : (
                renderList(matches, "")
              )
            ) : (
              <>
                <TabsContent value="suggested">
                  {renderList(suggested, "No folders yet.")}
                </TabsContent>
                <TabsContent value="all" className="px-2 py-2">
                  {/* One shared reason for every blocked row: repeating it per
                      item would make a screen reader read it on each arrow key. */}
                  <span id={BLOCKED_HINT_ID} className="sr-only">
                    Unavailable: this is the item being moved, or a folder
                    inside it.
                  </span>
                  <Tree indent={TREE_INDENT} tree={tree()}>
                    {tree().getItems().map((item) => {
                      const blocked = disabledIds.has(item.getId())

                      return (
                        <TreeItem
                          key={item.getId()}
                          item={item}
                          aria-disabled={blocked}
                          aria-describedby={
                            blocked ? BLOCKED_HINT_ID : undefined
                          }
                        >
                          <TreeItemLabel
                            className={cn(
                              "bg-transparent",
                              blocked && "pointer-events-none opacity-40"
                            )}
                          >
                            <span className="flex size-4 shrink-0 items-center [&_svg]:size-4">
                              {ICONS.folder}
                            </span>
                            <span className="min-w-0 truncate">
                              {item.getItemName()}
                            </span>
                          </TreeItemLabel>
                        </TreeItem>
                      )
                    })}
                  </Tree>
                </TabsContent>
              </>
            )}
          </div>
        </Tabs>

        {/* Destination reads as its own line, not squeezed beside the buttons */}
        <div className="bg-muted/40 flex min-w-0 items-center gap-2 border-t px-4 py-2.5">
          <span className="text-muted-foreground shrink-0 text-xs">
            Destination
          </span>
          <span className="text-foreground min-w-0 truncate text-xs font-medium">
            {destPath.join(" / ")}
          </span>
        </div>

        <DialogFooter className="m-0! shrink-0 gap-2 border-t p-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            // folderNodes membership, not just non-empty: a folder deleted from
            // under an open dialog leaves destId pointing at a row that no
            // longer exists, and confirming would move into nothing.
            disabled={
              destId === "" ||
              !folderNodes[destId] ||
              disabledIds.has(destId)
            }
            onClick={onConfirm}
          >
            Move Here
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}