"use client";

import { useCallback, useEffect, useState } from "react";
import { useAction } from "convex/react";
import { AlertTriangle, Landmark } from "lucide-react";

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
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { getUserFriendlyErrorMessage, logError } from "@/lib/error-logger";

type IncomeAccount = { qboId: string; name: string };

/**
 * One-time setup after the first connect: pick the income account synced
 * invoices post to. Confirming provisions the "OneTool Service" item in
 * QuickBooks and releases every job that was held waiting on it.
 */
export function QuickBooksSetupDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="w-[min(92vw,32rem)]">
				{/* Mounted per open so the chart of accounts is always re-fetched. */}
				{open && <SetupBody onDone={() => onOpenChange(false)} />}
			</DialogContent>
		</Dialog>
	);
}

function SetupBody({ onDone }: { onDone: () => void }) {
	const toast = useToast();
	const listSetupAccounts = useAction(api.quickbooksActions.listSetupAccounts);
	const completeSetup = useAction(api.quickbooksActions.completeSetup);

	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [incomeAccounts, setIncomeAccounts] = useState<IncomeAccount[]>([]);
	const [depositAccount, setDepositAccount] = useState<IncomeAccount | null>(
		null,
	);
	const [selectedId, setSelectedId] = useState("");
	const [saving, setSaving] = useState(false);

	const applyResult = useCallback(
		(result: {
			incomeAccounts: IncomeAccount[];
			depositAccount: IncomeAccount | null;
		}) => {
			setIncomeAccounts(result.incomeAccounts);
			setDepositAccount(result.depositAccount);
			setSelectedId(
				(current) => current || (result.incomeAccounts[0]?.qboId ?? ""),
			);
			setLoadError(null);
			setLoading(false);
		},
		[],
	);

	const applyError = useCallback((error: unknown) => {
		logError(error, { action: "quickbooks_list_setup_accounts" });
		setLoadError(
			getUserFriendlyErrorMessage(error) ??
				"We could not reach QuickBooks. Try again in a moment.",
		);
		setLoading(false);
	}, []);

	// Accounts come live from QuickBooks. Every state update lands in a promise
	// callback so nothing is set synchronously inside the effect.
	useEffect(() => {
		let cancelled = false;
		listSetupAccounts({})
			.then((result) => {
				if (!cancelled) applyResult(result);
			})
			.catch((error: unknown) => {
				if (!cancelled) applyError(error);
			});
		return () => {
			cancelled = true;
		};
	}, [listSetupAccounts, applyResult, applyError]);

	const retryLoad = useCallback(() => {
		setLoading(true);
		setLoadError(null);
		listSetupAccounts({}).then(applyResult).catch(applyError);
	}, [listSetupAccounts, applyResult, applyError]);

	const handleConfirm = useCallback(async () => {
		const account = incomeAccounts.find((a) => a.qboId === selectedId);
		if (!account) return;

		setSaving(true);
		try {
			await completeSetup({
				incomeAccountQboId: account.qboId,
				incomeAccountName: account.name,
			});
			toast.success(
				"QuickBooks setup complete",
				"Queued items will sync shortly.",
			);
			onDone();
		} catch (error) {
			logError(error, { action: "quickbooks_complete_setup" });
			toast.error(
				"Couldn't finish QuickBooks setup",
				getUserFriendlyErrorMessage(error) ?? "Try again in a moment.",
			);
		} finally {
			setSaving(false);
		}
	}, [completeSetup, incomeAccounts, selectedId, toast, onDone]);

	const noAccounts = !loading && !loadError && incomeAccounts.length === 0;

	return (
		<>
			<DialogHeader>
				<DialogTitle>Finish QuickBooks setup</DialogTitle>
				<DialogDescription>
					Choose the income account your synced invoices should post to. We use
					it to create the single &ldquo;OneTool Service&rdquo; item every
					synced line references.
				</DialogDescription>
			</DialogHeader>

			<div className="space-y-4 py-1">
				{loading ? (
					<div className="space-y-2">
						<Skeleton className="h-4 w-28" />
						<Skeleton className="h-9 w-full" />
						<Skeleton className="h-4 w-3/4" />
					</div>
				) : loadError ? (
					<div className="flex items-start gap-2.5 rounded-md border border-destructive/25 bg-destructive/[0.05] px-3 py-2.5">
						<AlertTriangle
							className="mt-0.5 size-4 shrink-0 text-destructive"
							aria-hidden="true"
						/>
						<div className="min-w-0 flex-1">
							<p className="text-sm text-foreground">{loadError}</p>
							<Button
								variant="outline"
								size="sm"
								className="mt-2"
								onClick={retryLoad}
							>
								Try again
							</Button>
						</div>
					</div>
				) : noAccounts ? (
					<div className="flex items-start gap-2.5 rounded-md border border-warning/25 bg-warning/[0.05] px-3 py-2.5">
						<AlertTriangle
							className="mt-0.5 size-4 shrink-0 text-warning"
							aria-hidden="true"
						/>
						<p className="min-w-0 flex-1 text-sm text-muted-foreground">
							This QuickBooks company has no income accounts yet. Add one in
							QuickBooks, then come back and finish setup.
						</p>
					</div>
				) : (
					<>
						<div className="space-y-1.5">
							<Label htmlFor="qbo-income-account">Income account</Label>
							<Select
								value={selectedId}
								onValueChange={(value) => setSelectedId(value as string)}
							>
								<SelectTrigger id="qbo-income-account" className="w-full">
									<SelectValue placeholder="Select an account" />
								</SelectTrigger>
								<SelectContent>
									{incomeAccounts.map((account) => (
										<SelectItem key={account.qboId} value={account.qboId}>
											{account.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<p className="text-xs text-muted-foreground">
								Invoice revenue from OneTool posts to this account.
							</p>
						</div>

						<div className="flex items-start gap-2.5 rounded-md border border-border bg-muted/40 px-3 py-2.5">
							<Landmark
								className="mt-0.5 size-4 shrink-0 text-muted-foreground"
								aria-hidden="true"
							/>
							<p className="min-w-0 flex-1 text-xs text-muted-foreground">
								{depositAccount
									? `Payments will be recorded to ${depositAccount.name}.`
									: "No Undeposited Funds account was found. Payment sync waits until one exists in QuickBooks; invoices still sync."}
							</p>
						</div>
					</>
				)}
			</div>

			<DialogFooter>
				<DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
				<Button
					onClick={() => void handleConfirm()}
					disabled={loading || saving || !selectedId}
				>
					{saving ? "Finishing…" : "Finish setup"}
				</Button>
			</DialogFooter>
		</>
	);
}
