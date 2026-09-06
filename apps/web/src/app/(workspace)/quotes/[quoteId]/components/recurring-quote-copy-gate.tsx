"use client";

import type { ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { usePermissions } from "@/hooks/use-permissions";
import { RecurringQuoteCopyDialog } from "./recurring-quote-copy-dialog";

type CopyAction = {
  onCopyToFuture?: () => void;
  copyToFutureDisabled?: boolean;
  copyToFutureDisabledReason?: string;
};

export function RecurringQuoteCopyGate({
  quoteId,
  quoteTitle,
  projectId,
  children,
}: {
  quoteId: Id<"quotes">;
  quoteTitle: string;
  projectId?: Id<"projects">;
  children: (action: CopyAction) => ReactNode;
}) {
  const { can, hasAllRecords } = usePermissions();
  const canManage =
    can("quotes", "modify") &&
    can("projects", "modify") &&
    hasAllRecords("quotes") &&
    hasAllRecords("projects");
  const setup = useQuery(
    api.projectSeriesQuotes.getSetup,
    projectId && canManage ? { projectId } : "skip",
  );

  if (!canManage || !setup) return children({});

  return (
    <RecurringQuoteCopyDialog
      quoteId={quoteId}
      quoteTitle={quoteTitle}
      canCopy={canManage && setup.canCopy}
    >
      {(openCopyDialog) =>
        children({
          onCopyToFuture: openCopyDialog,
          copyToFutureDisabled: !setup.canCopy,
          copyToFutureDisabledReason: setup.canCopy
            ? undefined
            : setup.state === "active"
              ? "This series uses a recurring agreement"
              : "Resume this series to copy quote setup",
        })
      }
    </RecurringQuoteCopyDialog>
  );
}
