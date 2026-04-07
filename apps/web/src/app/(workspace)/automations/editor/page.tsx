"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PremiumGate } from "../components/editor/premium-gate";
import { AutomationEditorScreen } from "../components/editor/automation-editor-screen";

function AutomationEditorWithSuspense() {
	const searchParams = useSearchParams();
	const automationId = searchParams.get("id");

	return (
		<Suspense
			fallback={
				<div className="flex min-h-screen items-center justify-center">
					<div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
				</div>
			}
		>
			<AutomationEditorScreen automationId={automationId} />
		</Suspense>
	);
}

export default function AutomationEditorPage() {
	return (
		<PremiumGate>
			<AutomationEditorWithSuspense />
		</PremiumGate>
	);
}
