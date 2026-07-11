import { Suspense } from "react";
import { CompleteOrganizationMetadata } from "./complete-organization";

// Suspense boundary: the wizard reads useSearchParams (?creating=true), which
// bails out of static prerendering without one.
export default function CompleteOrganizationPage() {
	return (
		<Suspense fallback={null}>
			<CompleteOrganizationMetadata />
		</Suspense>
	);
}
