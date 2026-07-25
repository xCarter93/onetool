"use client";

import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { usePathname } from "next/navigation";
import {
	createContext,
	useContext,
	useEffect,
	useMemo,
	useState,
	type ReactNode,
} from "react";

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

// Override channel for pages whose "current record" isn't URL-derivable
// (e.g. /routing, where the selected route lives in page state).
const CurrentRecordOverrideContext = createContext<{
	record: CurrentRecord | null;
	setRecord: (record: CurrentRecord | null) => void;
} | null>(null);

export function CurrentRecordProvider({ children }: { children: ReactNode }) {
	const [record, setRecord] = useState<CurrentRecord | null>(null);
	const value = useMemo(() => ({ record, setRecord }), [record]);
	return (
		<CurrentRecordOverrideContext.Provider value={value}>
			{children}
		</CurrentRecordOverrideContext.Provider>
	);
}

/** Publish the page's current record for the assistant panel; cleared on unmount. */
export function usePublishCurrentRecord(record: CurrentRecord | null) {
	const setRecord = useContext(CurrentRecordOverrideContext)?.setRecord;
	// Primitive deps so re-renders with an equal record don't republish (loop).
	const { kindLabel, name, status } = record ?? {};
	useEffect(() => {
		if (!setRecord) return;
		setRecord(kindLabel ? { kindLabel, name, status } : null);
		return () => setRecord(null);
	}, [setRecord, kindLabel, name, status]);
}

export function useCurrentRecord(): CurrentRecord | null {
	const override = useContext(CurrentRecordOverrideContext)?.record ?? null;
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

	if (override) return override;
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
