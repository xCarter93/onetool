"use client";

import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { usePathname } from "next/navigation";

/**
 * Identifies the record detail page the user is on (client/project/quote/
 * invoice) and fetches just enough to label it in the assistant panel. The
 * matching page already runs the same `get` query, so this hits the Convex
 * subscription cache rather than adding real load.
 */

export interface CurrentRecord {
	kindLabel: string;
	/** undefined while loading */
	name?: string;
	status?: string;
}

// Convex IDs are ~32 lowercase alphanumerics; the length bound keeps static
// segments (new, import) and garbage URLs from being sent to v.id validators.
const RECORD_PATH = /^\/(clients|projects|quotes|invoices)\/([a-z0-9]{20,40})$/;

export function useCurrentRecord(): CurrentRecord | null {
	const pathname = usePathname();
	const match = pathname?.match(RECORD_PATH);
	const kind = match?.[1];
	const id = match?.[2];

	const client = useQuery(
		api.clients.get,
		kind === "clients" ? { id: id as Id<"clients"> } : "skip"
	);
	const project = useQuery(
		api.projects.get,
		kind === "projects" ? { id: id as Id<"projects"> } : "skip"
	);
	const quote = useQuery(
		api.quotes.get,
		kind === "quotes" ? { id: id as Id<"quotes"> } : "skip"
	);
	const invoice = useQuery(
		api.invoices.get,
		kind === "invoices" ? { id: id as Id<"invoices"> } : "skip"
	);

	if (!kind || !id) return null;

	switch (kind) {
		case "clients":
			if (client === null) return null;
			return {
				kindLabel: "Client",
				name: client?.companyName,
				status: client?.status,
			};
		case "projects":
			if (project === null) return null;
			return {
				kindLabel: "Project",
				name: project?.title,
				status: project?.status,
			};
		case "quotes":
			if (quote === null) return null;
			return {
				kindLabel: "Quote",
				name:
					quote === undefined
						? undefined
						: (quote.title ?? quote.quoteNumber ?? "Untitled quote"),
				status: quote?.status,
			};
		case "invoices":
			if (invoice === null) return null;
			return {
				kindLabel: "Invoice",
				name:
					invoice === undefined ? undefined : `#${invoice.invoiceNumber}`,
				status: invoice?.status,
			};
		default:
			return null;
	}
}
