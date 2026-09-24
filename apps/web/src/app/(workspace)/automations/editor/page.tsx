"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PermissionGate } from "@/components/domain/permission-gate";
import { PremiumGate } from "../components/editor/premium-gate";
import { AutomationEditorScreen } from "../components/editor/automation-editor-screen";
import { Skeleton } from "@/components/ui/skeleton";

function AutomationEditorWithSuspense() {
	const searchParams = useSearchParams();
	const automationId = searchParams.get("id");

	return (
		<Suspense
			fallback={
				<main className="workspace-detail workspace-page">
					<div className="workspace-page-header">
						<Skeleton className="h-8 w-64" />
					</div>
					<div className="workspace-panel min-h-[24rem] p-6">
						<Skeleton className="h-6 w-48" />
						<Skeleton className="mt-6 h-48 w-full" />
					</div>
				</main>
			}
		>
			<AutomationEditorScreen automationId={automationId} />
		</Suspense>
	);
}

export default function AutomationEditorPage() {
	return (
		<PermissionGate object="automations" level="modify">
			<PremiumGate>
				<AutomationEditorWithSuspense />
			</PremiumGate>
		</PermissionGate>
	);
}
