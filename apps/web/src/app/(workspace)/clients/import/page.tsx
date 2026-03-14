"use client";

import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useFeatureAccess } from "@/hooks/use-feature-access";
import { ImportWizard } from "./components/import-wizard";

function ImportPageContent() {
	const router = useRouter();
	const { hasPremiumAccess, isLoading } = useFeatureAccess();

	useEffect(() => {
		if (!isLoading && !hasPremiumAccess) {
			router.replace("/clients");
		}
	}, [hasPremiumAccess, isLoading, router]);

	if (isLoading) {
		return <ImportPageSkeleton />;
	}

	if (!hasPremiumAccess) {
		return null;
	}

	return <ImportWizard />;
}

function ImportPageSkeleton() {
	return (
		<div className="flex flex-col h-full animate-pulse">
			<div className="border-b border-border px-6 py-4">
				<div className="h-5 w-96 bg-muted rounded" />
			</div>
			<div className="flex-1 px-6 py-6 space-y-6">
				<div className="max-w-2xl mx-auto space-y-4">
					<div className="h-6 w-48 bg-muted rounded" />
					<div className="h-4 w-80 bg-muted rounded" />
					<div className="h-48 bg-muted rounded-lg" />
				</div>
			</div>
		</div>
	);
}

export default function ClientsImportPage() {
	return (
		<Suspense fallback={<ImportPageSkeleton />}>
			<ImportPageContent />
		</Suspense>
	);
}
