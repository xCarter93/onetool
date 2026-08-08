"use client";

import { useCallback, useState } from "react";
import { useMutation } from "convex/react";
import { AlertTriangle } from "lucide-react";

import { api } from "@onetool/backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { getUserFriendlyErrorMessage, logError } from "@/lib/error-logger";

const CONNECT_URL = "/api/quickbooks/connect";

/**
 * Way out of a realm mismatch: wipe the old company's links, then send the
 * owner straight back to Intuit to pick a company.
 */
export function QuickBooksResetDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const toast = useToast();
	const resetConnection = useMutation(api.quickbooks.resetConnection);
	const [resetting, setResetting] = useState(false);

	const handleReset = useCallback(async () => {
		setResetting(true);
		try {
			await resetConnection({});
			// Pending state stays on until the browser leaves the page.
			window.location.assign(CONNECT_URL);
		} catch (error) {
			logError(error, { action: "quickbooks_reset_connection" });
			toast.error(
				"Couldn't reset QuickBooks",
				getUserFriendlyErrorMessage(error) ?? "Try again in a moment.",
			);
			setResetting(false);
		}
	}, [resetConnection, toast]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="w-[min(92vw,32rem)]">
				<DialogHeader>
					<DialogTitle>Reset QuickBooks connection</DialogTitle>
					<DialogDescription>
						This disconnects QuickBooks and clears every sync link between
						OneTool and the old company. Your OneTool clients, invoices, and
						payments are untouched, and nothing is deleted in QuickBooks.
						You&rsquo;ll pick a QuickBooks company to connect right after.
					</DialogDescription>
				</DialogHeader>

				<div className="py-1">
					<div className="flex items-start gap-2.5 rounded-md border border-destructive/25 bg-destructive/[0.05] px-3 py-2.5">
						<AlertTriangle
							className="mt-0.5 size-4 shrink-0 text-destructive"
							aria-hidden="true"
						/>
						<p className="min-w-0 flex-1 text-sm text-foreground">
							Sync history can&rsquo;t be relinked automatically after a reset.
						</p>
					</div>
				</div>

				<DialogFooter>
					<DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
					<Button
						variant="destructive"
						onClick={() => void handleReset()}
						disabled={resetting}
					>
						{resetting ? "Resetting…" : "Reset and connect"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
