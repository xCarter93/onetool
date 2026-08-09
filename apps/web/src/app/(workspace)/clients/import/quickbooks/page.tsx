"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";

import { api } from "@onetool/backend/convex/_generated/api";
import { EmptyState } from "@/components/domain/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useFeatureAccess } from "@/hooks/use-feature-access";
import { useOrgOwner } from "@/app/(workspace)/organization/profile/_hooks/use-org-owner";
import { useQuickBooksEnabled } from "@/hooks/use-quickbooks-enabled";
import { QboImportReview } from "./components/qbo-import-review";

const INTEGRATIONS_URL = "/organization/profile?tab=integrations";

function ImportSkeleton() {
	return (
		<div className="h-[calc(100dvh-7rem)] px-4 py-4 sm:px-6 sm:py-6">
			<div className="mx-auto h-full w-full max-w-7xl space-y-4 rounded-xl border border-border bg-card p-5 sm:p-6">
				<Skeleton className="h-5 w-56" />
				<Skeleton className="h-10 w-full max-w-md" />
				<div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
					{[0, 1, 2, 3, 4].map((index) => (
						<Skeleton key={index} className="h-12" />
					))}
				</div>
				<div className="space-y-3">
					{[0, 1, 2, 3, 4].map((index) => (
						<Skeleton key={index} className="h-12" />
					))}
				</div>
			</div>
		</div>
	);
}

function NoRunState({ onBack }: { onBack: () => void }) {
	return (
		<div className="px-4 py-10 sm:px-6">
			<div className="mx-auto w-full max-w-2xl rounded-xl border border-border bg-card">
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
			</div>
		</div>
	);
}

function UnavailableState({ onBack }: { onBack: () => void }) {
	return (
		<div className="px-4 py-10 sm:px-6">
			<div className="mx-auto w-full max-w-2xl rounded-xl border border-border bg-card">
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
			</div>
		</div>
	);
}

export default function QuickBooksImportPage() {
	const router = useRouter();
	const qboEnabled = useQuickBooksEnabled();
	const { isOwner, isLoading: ownerLoading } = useOrgOwner();
	const { hasPremiumAccess, isLoading: accessLoading } = useFeatureAccess();

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
