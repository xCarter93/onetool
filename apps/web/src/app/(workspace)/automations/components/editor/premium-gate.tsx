"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StyledButton } from "@/components/ui/styled/styled-button";
import { useFeatureAccess } from "@/hooks/use-feature-access";
import { useRoleAccess } from "@/hooks/use-role-access";

export function PremiumGate({ children }: { children: ReactNode }) {
	const router = useRouter();
	const { isAdmin, isLoading: roleLoading } = useRoleAccess();
	const { hasPremiumAccess, isLoading: featureLoading } = useFeatureAccess();

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
						<Button intent="outline" onPress={() => router.push("/automations")}>
							Back
						</Button>
						{isAdmin && !hasPremiumAccess && (
							<StyledButton
								intent="primary"
								onClick={() => router.push("/subscription")}
							>
								Upgrade to Business
							</StyledButton>
						)}
					</div>
				</div>
			</div>
		);
	}

	return <>{children}</>;
}
