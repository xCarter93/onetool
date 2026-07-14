"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Plus, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
	PillTabs,
	PillTabsList,
	PillTabsTrigger,
	PillTabsContent,
} from "@/components/shared/pill-tabs";
import { Button } from "@/components/ui/button";
import { PermissionGate } from "@/components/domain/permission-gate";
import { useRoleAccess } from "@/hooks/use-role-access";
import { useFeatureAccess } from "@/hooks/use-feature-access";
import { RunMetricsTiles } from "./components/run-metrics-tiles";
import { RunThroughputChart } from "./components/run-throughput-chart";
import { RecentFailuresTimeline } from "./components/recent-failures-timeline";
import { AutomationsTable } from "./components/automations-table";
import { RunsTable } from "./components/runs-table";

// Premium feature gate — admins on a premium plan only.
function PremiumGate({ children }: { children: React.ReactNode }) {
	const { isAdmin, isLoading: roleLoading } = useRoleAccess();
	const { hasPremiumAccess, isLoading: featureLoading } = useFeatureAccess();
	const router = useRouter();

	if (roleLoading || featureLoading) {
		return (
			<div className="relative p-6 space-y-6">
				<div className="flex items-center gap-3">
					<div className="w-1.5 h-6 bg-linear-to-b from-primary to-primary/60 rounded-full" />
					<div>
						<h1 className="text-2xl font-bold text-foreground">Automations</h1>
						<p className="text-muted-foreground text-sm">Loading…</p>
					</div>
				</div>
				<Card>
					<CardContent className="py-12">
						<div className="flex items-center justify-center">
							<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	if (!isAdmin || !hasPremiumAccess) {
		return (
			<div className="relative p-6 space-y-6">
				<div className="flex items-center gap-3">
					<div className="w-1.5 h-6 bg-linear-to-b from-primary to-primary/60 rounded-full" />
					<div>
						<h1 className="text-2xl font-bold text-foreground">Automations</h1>
						<p className="text-muted-foreground text-sm">
							Automate your workflows
						</p>
					</div>
				</div>
				<Card className="group relative overflow-hidden ring-1 ring-border/20 dark:ring-border/40">
					<CardContent className="relative z-10 py-16">
						<div className="flex flex-col items-center justify-center text-center max-w-md mx-auto">
							<div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
								<Lock className="h-10 w-10 text-primary" />
							</div>
							<h3 className="mb-2 text-xl font-semibold text-foreground">
								{!isAdmin ? "Admin Access Required" : "Premium Feature"}
							</h3>
							<p className="text-muted-foreground mb-6">
								{!isAdmin
									? "Only organization administrators can access and manage workflow automations."
									: "Workflow automations are available on the Business plan. Upgrade to automate your workflows and save time."}
							</p>
							{!hasPremiumAccess && isAdmin && (
								<Button onClick={() => router.push("/organization/profile?tab=billing")}>
									Upgrade to Business
								</Button>
							)}
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	return <>{children}</>;
}

function AutomationsContent() {
	const router = useRouter();

	return (
		<div className="relative p-6 space-y-6">
			<div className="flex items-center justify-between gap-4">
				<div className="flex items-center gap-3">
					<div className="w-1.5 h-6 bg-linear-to-b from-primary to-primary/60 rounded-full" />
					<div>
						<h1 className="text-2xl font-bold text-foreground">Automations</h1>
						<p className="text-muted-foreground text-sm">
							Monitor runs, latency, and failures across your workflows
						</p>
					</div>
				</div>
				<Button onClick={() => router.push("/automations/editor")}>
					<Plus className="h-4 w-4" />
					Create Automation
				</Button>
			</div>

			<RunMetricsTiles />

			<div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
				<RunThroughputChart className="h-full lg:col-span-2" />
				<RecentFailuresTimeline className="h-full lg:col-span-1" />
			</div>

			<PillTabs defaultValue="automations" className="w-full">
				<PillTabsList className="overflow-x-auto">
					<PillTabsTrigger value="automations">Automations</PillTabsTrigger>
					<PillTabsTrigger value="runs">Runs</PillTabsTrigger>
				</PillTabsList>
				<PillTabsContent value="automations" className="mt-4">
					<AutomationsTable />
				</PillTabsContent>
				<PillTabsContent value="runs" className="mt-4">
					<RunsTable />
				</PillTabsContent>
			</PillTabs>
		</div>
	);
}

export default function AutomationsPage() {
	return (
		<PermissionGate object="automations">
			<PremiumGate>
				<AutomationsContent />
			</PremiumGate>
		</PermissionGate>
	);
}
