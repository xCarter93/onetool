"use client";

import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { useConvex, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { CopyPlus, Loader2 } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import { convexErrorMessage } from "@/lib/convex-error";

type Preview = {
  revision: number;
  createCount: number;
  updateCount: number;
  preservedCount: number;
};

export function RecurringQuoteCopyDialog({
  quoteId,
  quoteTitle,
  canCopy,
  children,
}: {
  quoteId: Id<"quotes">;
  quoteTitle: string;
  canCopy: boolean;
  children: (openDialog: () => void) => ReactNode;
}) {
  const convex = useConvex();
  const copyQuote = useMutation(api.projectSeriesQuotes.copy);
  const toast = useToast();
  const requestId = useRef(0);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadPreview = async () => {
    const request = ++requestId.current;
    setPreview(null);
    setError(null);
    setIsPreviewing(true);
    try {
      const result = await convex.query(api.projectSeriesQuotes.previewCopy, {
        quoteId,
      });
      if (request === requestId.current) setPreview(result);
    } catch (nextError) {
      if (request === requestId.current) {
        setError(
          convexErrorMessage(nextError, "Refresh the preview and try again."),
        );
      }
    } finally {
      if (request === requestId.current) setIsPreviewing(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (isSubmitting) return;
    if (nextOpen) {
      setOpen(true);
      void loadPreview();
      return;
    }
    requestId.current++;
    setPreview(null);
    setError(null);
    setIsPreviewing(false);
    setOpen(false);
  };

  const confirmCopy = async () => {
    if (!preview || !canCopy || error || isPreviewing || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await copyQuote({
        quoteId,
        expectedRevision: preview.revision,
      });
      toast.success(
        "Future quote setup saved",
        `Created: ${result.createCount}. Updated: ${result.updateCount}. Preserved: ${result.preservedCount}.`,
      );
      requestId.current++;
      setPreview(null);
      setOpen(false);
    } catch (nextError) {
      setPreview(null);
      setError(
        convexErrorMessage(
          nextError,
          "Review the latest project changes and try again.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {children(() => handleOpenChange(true))}
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Copy to future projects?</DialogTitle>
            <DialogDescription>
              Save “{quoteTitle}” for new projects in this series and copy it to
              eligible planned projects now. Every copy stays a draft.
            </DialogDescription>
          </DialogHeader>

          {isPreviewing ? (
            <div
              aria-label="Loading quote copy preview"
              className="space-y-2 rounded-md bg-muted p-4"
            >
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-5 w-52" />
              <Skeleton className="h-5 w-48" />
            </div>
          ) : preview ? (
            <div className="space-y-1 rounded-md bg-muted p-4 text-sm tabular-nums">
              <p className="font-medium text-foreground">
                Draft quotes to create: {preview.createCount}
              </p>
              <p className="text-muted-foreground">
                Existing draft copies to update: {preview.updateCount}
              </p>
              <p className="text-muted-foreground">
                Visits left unchanged: {preview.preservedCount}
              </p>
              <p className="pt-2 text-muted-foreground">
                Existing draft copies from this source can be replaced. Skipped,
                started, and invoiced visits stay unchanged, along with sent,
                approved, manual, and other-source quotes.
              </p>
            </div>
          ) : null}

          {error && (
            <div
              role="alert"
              className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
            >
              <p>{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 min-h-11"
                onClick={() => void loadPreview()}
              >
                Review changes again
              </Button>
            </div>
          )}

          <DialogFooter showCloseButton>
            <Button
              className="min-h-11"
              disabled={
                !preview ||
                !canCopy ||
                Boolean(error) ||
                isPreviewing ||
                isSubmitting
              }
              onClick={() => void confirmCopy()}
            >
              {isSubmitting && (
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
              )}
              <CopyPlus className="size-4" /> Copy drafts
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
