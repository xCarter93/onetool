"use client";

import { ProjectOnboardingForm } from "@/app/(workspace)/projects/components/project-onboarding-form";
import { PermissionGate } from "@/components/domain/permission-gate";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";

function ProjectNewContent() {
	const searchParams = useSearchParams();
	const clientId = searchParams.get("clientId") as Id<"clients"> | null;

	return <ProjectOnboardingForm preselectedClientId={clientId} />;
}

export default function NewProjectPage() {
	return (
		<PermissionGate object="projects">
			<Suspense fallback={<div>Loading...</div>}>
				<ProjectNewContent />
			</Suspense>
		</PermissionGate>
	);
}
