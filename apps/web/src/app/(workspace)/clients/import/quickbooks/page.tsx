"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";

import { api } from "@onetool/backend/convex/_generated/api";
import { EmptyState } from "@/components/domain/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useEntitlements } from "@/hooks/use-entitlements";
import { useOrgOwner } from "@/app/(workspace)/organization/profile/_hooks/use-org-owner";
import { useQuickBooksEnabled } from "@/hooks/use-quickbooks-enabled";
import { QboImportReview } from "./components/qbo-import-review";

const INTEGRATIONS_URL = "/organization/profile?tab=integrations";

function ImportSkeleton() {
	return (
		<main className="workspace-page">
			<div className="workspace-page-header">
				<div className="space-y-2">
					<Skeleton className="h-8 w-64" />
					<Skeleton className="h-4 w-80 max-w-full" />
				</div>
			</div>
			<div className="space-y-6">
				<div className="grid grid-cols-2 gap-3 border-b pb-6 sm:grid-cols-5">
					{[0, 1, 2, 3, 4].map((index) => (
						<Skeleton key={index} className="h-8" />
					))}
				</div>
				<div className="space-y-3">
					{[0, 1, 2, 3, 4].map((index) => (
						<Skeleton key={index} className="h-11" />
					))}
				</div>
			</div>
		</main>
	);
}

function NoRunState({ onBack }: { onBack: () => void }) {
	return (
		<main className="workspace-page">
			<header className="workspace-page-header">
				<h1>Import from QuickBooks</h1>
			</header>
			<section className="workspace-panel max-w-3xl">
				<EmptyState
					size="md"
					title="No import to review"
					description="Start a QuickBooks customer import from the Integrations tab, then come back here to review it."
					action={
						<Button variant="outline" onClick={onBack}>
							Back to integrations
						</Button>
					}
				/>
			</section>
		</main>
	);
}

function UnavailableState({ onBack }: { onBack: () => void }) {
	return (
		<main className="workspace-page">
			<header className="workspace-page-header">
				<h1>Import from QuickBooks</h1>
			</header>
			<section className="workspace-panel max-w-3xl">
				<EmptyState
					size="md"
					title="QuickBooks import is coming soon"
					description="We're finishing certification with Intuit. Once that's done you'll be able to bring your QuickBooks customers straight into OneTool."
					action={
						<Button variant="outline" onClick={onBack}>
							Back to integrations
						</Button>
					}
				/>
			</section>
		</main>
	);
}

export default function QuickBooksImportPage() {
	const router = useRouter();
	const qboEnabled = useQuickBooksEnabled();
	const { isOwner, isLoading: ownerLoading } = useOrgOwner();
	const { allows, isLoading: accessLoading } = useEntitlements();
	const hasPremiumAccess = allows("quickbooks");

	// The route is reachable by URL, so it carries the same flag gate as the
	// Integrations card rather than trusting that nothing links here.
	const canReview =
		qboEnabled && !ownerLoading && !accessLoading && isOwner && hasPremiumAccess;
	const connection = useQuery(
		api.quickbooks.getConnectionStatus,
		canReview ? {} : "skip"
	);
	const run = useQuery(api.quickbooksImport.getImportRun, canReview ? {} : "skip");

	// Landing on the page mid-commit has to survive the run flipping to
	// completed, so remember that this visit watched a live run. Derived at
	// render rather than from an effect.
	const [sawLiveRun, setSawLiveRun] = useState(false);
	const liveNow =
		run?.status === "running" ||
		run?.status === "reviewing" ||
		run?.status === "committing";
	if (liveNow && !sawLiveRun) setSawLiveRun(true);

	if (ownerLoading || accessLoading) {
		return <ImportSkeleton />;
	}
	// Distinct from NoRunState: "start one from Integrations" is bad advice when
	// the integration itself isn't open yet.
	if (!qboEnabled) {
		return <UnavailableState onBack={() => router.push(INTEGRATIONS_URL)} />;
	}
	if (!canReview) {
		return <NoRunState onBack={() => router.push(INTEGRATIONS_URL)} />;
	}
	if (connection === undefined || run === undefined) {
		return <ImportSkeleton />;
	}

	const connected = connection !== null && connection.status !== "disconnected";
	const reviewable =
		run !== null && (liveNow || (run.status === "completed" && sawLiveRun));

	if (!connected || run === null || !reviewable) {
		return <NoRunState onBack={() => router.push(INTEGRATIONS_URL)} />;
	}

	return <QboImportReview run={run} />;
}
