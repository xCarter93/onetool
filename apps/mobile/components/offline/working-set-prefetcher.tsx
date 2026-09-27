import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useConvex, type ConvexReactClient } from "convex/react";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { getRecents } from "@/lib/recents";
import { localDayStartMs, utcDayStartMs } from "@/lib/date";
import { scheduleWindow } from "@/lib/agenda";
import { useOffline } from "@/lib/offline/OfflineProvider";
import { prefetchQuery } from "@/lib/offline/useCachedQuery";
import { isDocumentFresh } from "@/lib/offline/quote-signing";
import { selectWorkingSet, type RecordRef } from "@/lib/offline/working-set";

const MIN_INTERVAL_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
// PDF renders are real work on the server; prepare only a handful per pass.
const MAX_PDF_PREPARES = 5;

type Fetch = <Q extends FunctionReference<"query">>(query: Q, args: FunctionArgs<Q>) => Promise<unknown>;

async function prefetchRecord(fetch: Fetch, client: ConvexReactClient, ref: RecordRef, pdfBudget: { left: number }) {
	switch (ref.kind) {
		case "task": {
			const task = (await fetch(api.tasks.get, { id: ref.id as Id<"tasks"> })) as { clientId?: Id<"clients"> } | null;
			if (task?.clientId) await fetch(api.projects.list, { clientId: task.clientId });
			return;
		}
		case "project": {
			const projectId = ref.id as Id<"projects">;
			const project = (await fetch(api.projects.get, { id: projectId })) as { clientId: Id<"clients"> } | null;
			await fetch(api.quotes.list, { projectId });
			await fetch(api.invoices.list, { projectId });
			await fetch(api.tasks.list, { projectId });
			await fetch(api.teamMessages.listByEntity, { entityType: "project", entityId: ref.id });
			if (project) {
				await fetch(api.clientContacts.listByClient, { clientId: project.clientId });
				await fetch(api.clientProperties.listByClient, { clientId: project.clientId });
			}
			return;
		}
		case "client": {
			const clientId = ref.id as Id<"clients">;
			await fetch(api.clients.get, { id: clientId });
			await fetch(api.clientContacts.listByClient, { clientId });
			await fetch(api.clientProperties.listByClient, { clientId });
			await fetch(api.projects.list, { clientId });
			await fetch(api.quotes.list, { clientId });
			await fetch(api.invoices.list, { clientId });
			await fetch(api.teamMessages.listByEntity, { entityType: "client", entityId: ref.id });
			return;
		}
		case "quote": {
			const quoteId = ref.id as Id<"quotes">;
			const quote = (await fetch(api.quotes.get, { id: quoteId })) as {
				_id: string;
				status: string;
				clientId: Id<"clients">;
				contentUpdatedAt?: number;
				recurringAgreementTerms?: unknown;
			} | null;
			await fetch(api.quoteLineItems.listByQuote, { quoteId });
			await fetch(api.quotes.getApprovalAudit, { quoteId });
			await fetch(api.teamMessages.listByEntity, { entityType: "quote", entityId: ref.id });
			if (!quote) return;
			await fetch(api.clientContacts.listByClient, { clientId: quote.clientId });
			const docArgs = { documentType: "quote" as const, documentId: ref.id };
			const doc = (await fetch(api.documents.getLatest, docArgs)) as Parameters<typeof isDocumentFresh>[1];
			// Only a missing or stale document gets a fresh render; a fresh legacy one can't be improved.
			if (quote.status === "sent" && !isDocumentFresh(quote, doc) && pdfBudget.left > 0) {
				pdfBudget.left--;
				await client.action(api.pdfActions.ensureQuotePdf, { quoteId });
				await fetch(api.documents.getLatest, docArgs);
			}
			return;
		}
		case "invoice": {
			const invoiceId = ref.id as Id<"invoices">;
			await fetch(api.invoices.get, { id: invoiceId });
			await fetch(api.invoiceLineItems.listByInvoice, { invoiceId });
			await fetch(api.invoices.getWithPayments, { id: invoiceId });
			await fetch(api.invoices.getPortalLink, { id: invoiceId });
			await fetch(api.documents.getLatest, { documentType: "invoice", documentId: ref.id });
			return;
		}
	}
}

async function prefetchWorkingSet(client: ConvexReactClient, partition: string) {
	// One failed read (a permission gap, a deleted record) must not stop the rest.
	const fetch: Fetch = (query, args) => prefetchQuery(client, partition, query, args).catch(() => null);
	await fetch(api.clients.list, {});
	await fetch(api.users.listByOrg, {});
	await fetch(api.users.current, {});
	await fetch(api.routes.list, {});

	const start = localDayStartMs(Date.now());
	const [schedule, sentQuotes, overdueInvoices, recents] = await Promise.all([
		fetch(api.calendar.getCalendarEvents, scheduleWindow(start)) as Promise<FunctionReturnType<
			typeof api.calendar.getCalendarEvents
		> | null>,
		client.query(api.quotes.list, { status: "sent" }).catch(() => []),
		client.query(api.invoices.getOverdue, {}).catch(() => []),
		getRecents(partition),
	]);
	// Task dates are UTC midnights; keep today and tomorrow.
	const day = utcDayStartMs(start);
	const end = day + 2 * DAY_MS;
	const calendar = schedule && {
		tasks: schedule.tasks.filter((task) => task.startDate >= day && task.startDate < end),
		projects: schedule.projects.filter((project) => (project.endDate ?? project.startDate) >= day && project.startDate < end),
	};
	const refs = selectWorkingSet({ calendar, sentQuotes, overdueInvoices, recents });
	const pdfBudget = { left: MAX_PDF_PREPARES };
	for (const ref of refs) {
		await prefetchRecord(fetch, client, ref, pdfBudget).catch(() => {});
	}
}

/** Keeps the day's records readable offline without the user opening each one first (PRD P3). */
export function WorkingSetPrefetcher() {
	const client = useConvex();
	const { partition, syncReady } = useOffline();
	const lastRun = useRef<{ partition: string; at: number } | null>(null);
	const running = useRef(false);

	useEffect(() => {
		if (!syncReady || !partition) return;
		const run = () => {
			const last = lastRun.current;
			const now = Date.now();
			if (running.current) return;
			if (last && last.partition === partition && now - last.at < MIN_INTERVAL_MS) return;
			running.current = true;
			lastRun.current = { partition, at: now };
			void prefetchWorkingSet(client, partition).finally(() => {
				running.current = false;
			});
		};
		run();
		const sub = AppState.addEventListener("change", (state) => {
			if (state === "active") run();
		});
		return () => sub.remove();
	}, [client, partition, syncReady]);

	return null;
}
