"use client";

import { useRef, useState } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import { CopyPlus, Loader2, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { RecordTasksTab } from "@/components/shared/record-tasks-tab";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import { convexErrorMessage } from "@/lib/convex-error";
import type { Task } from "@/types/task";

type Preview = {
  revision: number;
  createCount: number;
  updateCount: number;
  removeCount: number;
  preservedCount: number;
};

type Selection =
  | { kind: "copy"; task: Task }
  | {
      kind: "remove";
      template: {
        _id: Id<"projectTaskTemplates">;
        title: string;
        sourceAvailable: boolean;
      };
    };

function PreviewCounts({
  preview,
  kind,
}: {
  preview: Preview;
  kind: Selection["kind"];
}) {
  return (
    <div className="space-y-1 rounded-md bg-muted p-4 text-sm tabular-nums">
      {kind === "copy" ? (
        <>
          <p className="font-medium text-foreground">
            Tasks created: {preview.createCount}
          </p>
          <p className="text-muted-foreground">
            Untouched tasks updated: {preview.updateCount}
          </p>
        </>
      ) : (
        <p className="font-medium text-foreground">
          Untouched tasks removed: {preview.removeCount}
        </p>
      )}
      <p className="text-muted-foreground">
        Protected tasks preserved: {preview.preservedCount}
      </p>
    </div>
  );
}

export function RecurringTaskSetup({
  projectId,
  tasks,
  onAddTask,
}: {
  projectId: Id<"projects">;
  tasks: Doc<"tasks">[] | undefined;
  onAddTask: () => void;
}) {
  const { can, hasAllRecords } = usePermissions();
  const toast = useToast();
  const convex = useConvex();
  const copyTask = useMutation(api.projectSeriesTasks.copy);
  const removeTemplate = useMutation(api.projectSeriesTasks.remove);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const previewRequest = useRef(0);
  const canViewSetup =
    can("projects") &&
    can("tasks") &&
    hasAllRecords("projects") &&
    hasAllRecords("tasks");
  const canModify =
    canViewSetup && can("projects", "modify") && can("tasks", "modify");
  const canDelete = canModify && can("tasks", "delete");
  const setup = useQuery(
    api.projectSeriesTasks.getSetup,
    canViewSetup ? { projectId } : "skip",
  );
  const activeTemplates =
    setup?.templates.filter((template) => template.active) ?? [];
  const selectionAllowed = selection
    ? selection.kind === "copy"
      ? Boolean(setup?.canCopy && canModify)
      : Boolean(setup?.canRemove && canDelete)
    : false;

  const loadPreview = async (nextSelection: Selection) => {
    const request = ++previewRequest.current;
    setPreview(null);
    setPreviewError(null);
    setIsPreviewing(true);
    try {
      const result =
        nextSelection.kind === "copy"
          ? await convex.query(api.projectSeriesTasks.previewCopy, {
              taskId: nextSelection.task._id,
            })
          : await convex.query(api.projectSeriesTasks.previewRemoval, {
              templateId: nextSelection.template._id,
            });
      if (request === previewRequest.current) setPreview(result);
    } catch (error) {
      if (request === previewRequest.current) {
        setPreviewError(
          convexErrorMessage(error, "Refresh the preview and try again."),
        );
      }
    } finally {
      if (request === previewRequest.current) setIsPreviewing(false);
    }
  };

  const openPreview = (nextSelection: Selection) => {
    if (isSubmitting) return;
    setSelection(nextSelection);
    void loadPreview(nextSelection);
  };

  const closePreview = () => {
    previewRequest.current++;
    setSelection(null);
    setPreview(null);
    setPreviewError(null);
    setIsPreviewing(false);
  };

  const confirm = async () => {
    if (!selection || !preview || !selectionAllowed || previewError || isPreviewing || isSubmitting) return;
    setIsSubmitting(true);
    setPreviewError(null);
    try {
      if (selection.kind === "copy") {
        await copyTask({
          taskId: selection.task._id,
          expectedRevision: preview.revision,
        });
        toast.success(
          "Task setup saved",
          "The task was copied to eligible future projects.",
        );
      } else {
        await removeTemplate({
          templateId: selection.template._id,
          expectedRevision: preview.revision,
        });
        toast.success(
          "Task setup removed",
          "Future projects will no longer receive this task.",
        );
      }
      closePreview();
    } catch (error) {
      setPreview(null);
      setPreviewError(
        convexErrorMessage(error, "Review the latest changes and try again."),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const management =
    setup && activeTemplates.length > 0 ? (
      <section
        className="mb-5 rounded-lg border border-border"
        aria-labelledby="future-task-setup-title"
      >
        <div className="border-b border-border px-4 py-3">
          <h4
            id="future-task-setup-title"
            className="text-sm font-medium text-foreground"
          >
            Future task setup
          </h4>
          <p className="mt-0.5 text-sm text-muted-foreground">
            These tasks are added to new projects in this series.
          </p>
        </div>
        <ul className="divide-y divide-border">
          {activeTemplates.map((template) => (
            <li
              key={template._id}
              className="flex min-h-12 items-center gap-3 px-4 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {template.title}
                </p>
                {!template.sourceAvailable && (
                  <Badge variant="outline" className="mt-1 font-normal">
                    Source task deleted
                  </Badge>
                )}
              </div>
              {setup.canRemove && canDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-11"
                  onClick={() => openPreview({ kind: "remove", template })}
                  aria-label={`Remove ${template.title} from future projects`}
                >
                  <Trash2 className="size-4" /> Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>
    ) : setup === undefined && canViewSetup ? (
      <Skeleton className="mb-5 h-20 w-full" />
    ) : null;

  return (
    <>
      <RecordTasksTab
        tasks={tasks}
        onAddTask={onAddTask}
        entityType="project"
        headerContent={management}
        onCopyToFuture={
          setup && canModify
            ? (task) => openPreview({ kind: "copy", task })
            : undefined
        }
        canCopyToFuture={Boolean(setup?.canCopy && canModify)}
        copyToFutureTitle={
          setup && !setup.canCopy
            ? "Resume this series to copy tasks"
            : "Copy to future projects"
        }
      />

      <Dialog
        open={selection !== null}
        onOpenChange={(open) => !open && !isSubmitting && closePreview()}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selection?.kind === "copy"
                ? "Copy to future projects?"
                : "Remove from future projects?"}
            </DialogTitle>
            <DialogDescription>
              {selection?.kind === "copy"
                ? `Save “${selection.task.title}” for later projects and update eligible planned projects now.`
                : `Stop adding “${selection?.template.title ?? "this task"}” to later projects and remove untouched pending copies. Edited or started tasks stay in place.`}
            </DialogDescription>
          </DialogHeader>
          {isPreviewing ? (
            <div
              aria-label="Loading task preview"
              className="space-y-2 rounded-md bg-muted p-4"
            >
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 w-52" />
            </div>
          ) : preview ? (
            <PreviewCounts preview={preview} kind={selection?.kind ?? "copy"} />
          ) : null}
          {previewError && (
            <div
              role="alert"
              className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
            >
              <p>{previewError}</p>
              {selection && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 min-h-11"
                  onClick={() => void loadPreview(selection)}
                >
                  Review changes again
                </Button>
              )}
            </div>
          )}
          <DialogFooter showCloseButton>
            <Button
              variant={selection?.kind === "remove" ? "destructive" : "default"}
              className="min-h-11"
              disabled={
                !preview ||
                Boolean(previewError) ||
                !selectionAllowed ||
                isPreviewing ||
                isSubmitting
              }
              onClick={() => void confirm()}
            >
              {isSubmitting && (
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
              )}
              {selection?.kind === "copy" ? (
                <>
                  <CopyPlus className="size-4" /> Copy task
                </>
              ) : (
                "Remove task setup"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
