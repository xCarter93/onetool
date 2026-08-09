"use client"

// Create, rename and delete surfaces. Kept together because they share one
// controlled-name pattern: the parent owns the target, the dialog owns the
// draft, and submitting hands the trimmed name back.
import { useState } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export type NamePrompt =
  | { mode: "create"; parentId: string; parentLabel: string }
  | { mode: "rename"; targetId: string; currentName: string }

/**
 * Draft state lives here and NameDialog keys this by the prompt target, so a
 * different target re-seeds the field by remounting instead of a
 * setState-in-effect sync.
 */
function NameForm({
  prompt,
  onSubmit,
  onCancel,
}: {
  prompt: NamePrompt
  onSubmit: (name: string) => void
  onCancel: () => void
}) {
  const isRename = prompt.mode === "rename"
  const [name, setName] = useState(isRename ? prompt.currentName : "")
  const trimmed = name.trim()

  function submit() {
    if (!trimmed) return
    onSubmit(trimmed)
  }

  return (
    <>
      <Field>
        <FieldLabel htmlFor="drive-name">Name</FieldLabel>
        <Input
          id="drive-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit()
          }}
          placeholder="Untitled folder"
          autoComplete="off"
        />
      </Field>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={!trimmed} onClick={submit}>
          {isRename ? "Rename" : "Create"}
        </Button>
      </DialogFooter>
    </>
  )
}

export function NameDialog({
  prompt,
  onSubmit,
  onOpenChange,
}: {
  prompt: NamePrompt | null
  onSubmit: (name: string) => void
  onOpenChange: (open: boolean) => void
}) {
  const isRename = prompt?.mode === "rename"
  const formKey = prompt
    ? prompt.mode === "rename"
      ? `rename-${prompt.targetId}`
      : `create-${prompt.parentId}`
    : "closed"

  return (
    <Dialog open={prompt !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isRename ? "Rename" : "New Folder"}</DialogTitle>
          <DialogDescription>
            {prompt?.mode === "create"
              ? `Creates a folder inside ${prompt.parentLabel}.`
              : "Choose a new name for this item."}
          </DialogDescription>
        </DialogHeader>

        {prompt ? (
          <NameForm
            key={formKey}
            prompt={prompt}
            onSubmit={onSubmit}
            onCancel={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

export function DeleteDialog({
  targetLabel,
  impact,
  open,
  onConfirm,
  onOpenChange,
}: {
  targetLabel: string
  /** Real counts of what a folder delete takes with it; absent for a file. */
  impact?: { folderCount: number; documentCount: number }
  open: boolean
  onConfirm: () => void
  onOpenChange: (open: boolean) => void
}) {
  const contents =
    impact && (impact.folderCount > 0 || impact.documentCount > 0)
      ? [
          impact.documentCount > 0
            ? `${impact.documentCount} ${impact.documentCount === 1 ? "document" : "documents"}`
            : null,
          impact.folderCount > 0
            ? `${impact.folderCount} ${impact.folderCount === 1 ? "subfolder" : "subfolders"}`
            : null,
        ]
          .filter(Boolean)
          .join(" and ")
      : null

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {targetLabel}?</AlertDialogTitle>
          <AlertDialogDescription>
            {contents
              ? `This also deletes the ${contents} inside it. Deleted documents cannot be recovered.`
              : impact
                ? "This folder is empty. Once deleted it cannot be recovered."
                : "This document is permanently deleted and cannot be recovered."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}