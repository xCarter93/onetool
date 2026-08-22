"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRoleAccess } from "@/hooks/use-role-access";

/**
 * Admin gate only — the canvas, drafts, and dry-runs are free; publishing is
 * the Business-plan boundary and is gated at the publish affordances instead.
 */
export function PremiumGate({ children }: { children: ReactNode }) {
	const router = useRouter();
	const { isAdmin, isLoading: roleLoading } = useRoleAccess();

	if (roleLoading) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
			</div>
		);
	}

	if (!isAdmin) {
		return (
			<div className="p-6">
				<div className="mx-auto max-w-xl rounded-xl border border-border bg-background p-8 text-center shadow-sm">
					<div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
						<Lock className="h-8 w-8 text-primary" />
					</div>
					<h1 className="text-xl font-semibold">Admin Access Required</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						Only organization administrators can create and edit automations.
					</p>
					<div className="mt-6 flex justify-center gap-3">
						<Button variant="outline" onClick={() => router.push("/automations")}>
							Back
						</Button>
					</div>
				</div>
			</div>
		);
	}

	return <>{children}</>;
}
