"use client";

import {
	StatusProgressBar,
	type StatusEvent,
} from "@/components/shared/status-progress-bar";

type SignatureStatus =
	| "Draft"
	| "Sent"
	| "Viewed"
	| "Signed"
	| "Completed"
	| "Declined"
	| "Revoked"
	| "Expired";

interface SignatureProgressBarProps {
	status: SignatureStatus;
	events: StatusEvent[];
}

export function SignatureProgressBar({
	status,
	events,
}: SignatureProgressBarProps) {
	// Define the normal flow steps for signature workflow
	const steps = [
		{ id: "Sent", name: "Sent", order: 1 },
		{ id: "Viewed", name: "Viewed", order: 2 },
		{ id: "Signed", name: "Signed", order: 3 },
		{ id: "Completed", name: "Completed", order: 4 },
	];

	return (
		<StatusProgressBar
			status={status}
			steps={steps}
			events={events}
			failureStatuses={["Declined", "Revoked", "Expired"]}
			successStatuses={["Completed"]}
		/>
	);
}
