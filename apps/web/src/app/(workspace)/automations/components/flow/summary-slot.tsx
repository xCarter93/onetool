"use client";

import type { ReactNode } from "react";

/**
 * One value inside a node's sentence summary. Renders the value when set,
 * otherwise a dashed "empty" chip so the card names exactly what is missing.
 */
export function SummarySlot({ value }: { value: ReactNode | null | undefined }) {
	const empty =
		value === null ||
		value === undefined ||
		value === "" ||
		(typeof value === "number" && Number.isNaN(value));
	if (empty) {
		return (
			<span className="mx-0.5 inline-block rounded-sm border border-dashed border-muted-foreground/40 px-1 align-baseline text-xs font-semibold leading-4 text-muted-foreground">
				empty
			</span>
		);
	}
	return <span className="font-medium text-foreground">{value}</span>;
}
