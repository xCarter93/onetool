"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LearnMoreLink } from "@/components/help/learn-more";
import { useEntitlements } from "@/hooks/use-entitlements";
import { useRoleAccess } from "@/hooks/use-role-access";

export function PremiumGate({ children }: { children: ReactNode }) {
	const router = useRouter();
	const { isAdmin, isLoading: roleLoading } = useRoleAccess();
	const { isBusiness: hasPremiumAccess, isLoading: featureLoading } =
		useEntitlements();

	if (roleLoading || featureLoading) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
			</div>
		);
	}

	if (!isAdmin || !hasPremiumAccess) {
		return (
			<div className="p-6">
				<div className="mx-auto max-w-xl rounded-xl border border-border bg-background p-8 text-center shadow-sm">
					<div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
						<Lock className="h-8 w-8 text-primary" />
					</div>
					<h1 className="text-xl font-semibold">
						{!isAdmin ? "Admin Access Required" : "Premium Feature"}
					</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						{!isAdmin
							? "Only organization administrators can create and edit automations."
							: "Upgrade to Business to create workflow automations."}
					</p>
					<div className="mt-6 flex justify-center gap-3">
						<Button variant="outline" onClick={() => router.push("/automations")}>
							Back
						</Button>
						{isAdmin && !hasPremiumAccess && (
							<Button onClick={() => router.push("/organization/profile?tab=billing")}>
								Upgrade to Business
							</Button>
						)}
					</div>
					{isAdmin && !hasPremiumAccess && (
						<LearnMoreLink
							article="automations/automations-overview"
							label="Learn what automations can do"
							className="mt-3"
						/>
					)}
				</div>
			</div>
		);
	}

	return <>{children}</>;
}
