"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import { daysLate, isPastDue } from "@onetool/backend/convex/lib/invoiceLateness";
import { useIsOrgSwitching } from "@/hooks/use-is-org-switching";
import { useUtcToday } from "@/hooks/use-org-today";
import { formatCurrency } from "@/lib/money";
import type { Task } from "@/types/task";

/**
 * One source of truth for the Needs Attention queue. The compact panel, its
 * header badge and the full-queue sheet all read this hook, so a count can
 * never drift from the rows it summarizes.
 */

function todayUTC(): number {
	const now = new Date();
	return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}

export function getDaysLate(dateTimestamp: number): number {
	return Math.floor((todayUTC() - dateTimestamp) / (24 * 60 * 60 * 1000));
}

export function getDaysUntil(dateTimestamp: number): number {
	return Math.floor((dateTimestamp - todayUTC()) / (24 * 60 * 60 * 1000));
}

function formatTime(time?: string): string | null {
	if (!time) return null;
	const [hours, minutes] = time.split(":");
	const hour = parseInt(hours);
	const ampm = hour >= 12 ? "PM" : "AM";
	const displayHour = hour % 12 || 12;
	return `${displayHour}:${minutes} ${ampm}`;
}

export function taskUrgency(task: Task): { label: string; overdue: boolean } {
	const daysLate = getDaysLate(task.date);
	if (daysLate > 0) {
		return {
			label: `${daysLate} day${daysLate !== 1 ? "s" : ""} late`,
			overdue: true,
		};
	}
	const daysUntil = getDaysUntil(task.date);
	return {
		label:
			daysUntil === 0
				? (formatTime(task.startTime) ?? "Today")
				: `In ${daysUntil} day${daysUntil !== 1 ? "s" : ""}`,
		overdue: false,
	};
}

export type AttentionInvoice = Doc<"invoices"> & {
	earliestPaymentDueDate?: number;
	remainingBalance?: number;
};

export function invoiceUrgency(
	invoice: AttentionInvoice,
	utcToday: number
): {
	label: string;
	overdue: boolean;
} {
	const due = invoice.earliestPaymentDueDate ?? invoice.dueDate;
	if (isPastDue(due, utcToday)) {
		const daysOverdue = daysLate(due, utcToday);
		return {
			label: `${daysOverdue} day${daysOverdue !== 1 ? "s" : ""} overdue`,
			overdue: true,
		};
	}
	const daysUntilDue = Math.round((due - utcToday) / 86_400_000);
	return {
		label:
			daysUntilDue === 0
				? "Due today"
				: `Due in ${daysUntilDue} day${daysUntilDue !== 1 ? "s" : ""}`,
		overdue: false,
	};
}

export function quoteUrgency(quote: Doc<"quotes">): {
	label: string;
	overdue: boolean;
} {
	const daysUntilExpiry = quote.validUntil
		? getDaysUntil(quote.validUntil)
		: null;
	if (daysUntilExpiry === null) {
		return { label: "Awaiting signature", overdue: false };
	}
	if (daysUntilExpiry < 0) {
		const days = Math.abs(daysUntilExpiry);
		return {
			label: `Expired ${days} day${days !== 1 ? "s" : ""} ago`,
			overdue: true,
		};
	}
	return {
		label:
			daysUntilExpiry === 0
				? "Expires today"
				: `Expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? "s" : ""}`,
		overdue: false,
	};
}

export interface AttentionQueue {
	isLoading: boolean;
	tasks: Task[];
	invoices: AttentionInvoice[];
	quotes: Doc<"quotes">[];
	counts: { tasks: number; invoices: number; quotes: number; total: number };
	summaries: { tasks: string; invoices: string; quotes: string };
	overdueCount: number;
	getClientName: (clientId?: Id<"clients">) => string;
}

export function useAttentionQueue(): AttentionQueue {
	const isOrgSwitching = useIsOrgSwitching();
	const utcToday = useUtcToday();
	const overdueTasks = useQuery(api.tasks.getOverdue, { today: utcToday });
	const upcomingTasks = useQuery(api.tasks.getUpcoming, {
		daysAhead: 7,
		today: utcToday,
	});
	const overdueInvoices = useQuery(api.invoices.getOverdue, {});
	const awaitingQuotes = useQuery(api.quotes.getAwaitingSigning, {});
	const clients = useQuery(api.clients.listNamesForOrg, {});

	const isLoading =
		isOrgSwitching ||
		overdueTasks === undefined ||
		upcomingTasks === undefined ||
		overdueInvoices === undefined ||
		awaitingQuotes === undefined ||
		clients === undefined;

	const tasks = useMemo(() => {
		const merged = [...(overdueTasks ?? []), ...(upcomingTasks ?? [])].sort(
			(a, b) => a.date - b.date
		);
		// getOverdue and getUpcoming overlap on today's late items.
		const seen = new Set<string>();
		return merged.filter((task) => {
			if (seen.has(task._id)) return false;
			seen.add(task._id);
			return true;
		});
	}, [overdueTasks, upcomingTasks]);

	const invoices = useMemo(
		() =>
			[...((overdueInvoices ?? []) as AttentionInvoice[])].sort(
				(a, b) =>
					(a.earliestPaymentDueDate ?? a.dueDate) -
					(b.earliestPaymentDueDate ?? b.dueDate)
			),
		[overdueInvoices]
	);

	const quotes = useMemo(
		() =>
			[...((awaitingQuotes ?? []) as Doc<"quotes">[])].sort(
				(a, b) => (a.validUntil ?? Infinity) - (b.validUntil ?? Infinity)
			),
		[awaitingQuotes]
	);

	const clientNames = useMemo(
		() => new Map((clients ?? []).map((c) => [c._id, c.companyName])),
		[clients]
	);

	return useMemo(() => {
		const overdueTaskCount = tasks.filter(
			(t) => taskUrgency(t).overdue
		).length;
		const todayTaskCount = tasks.filter(
			(t) => getDaysUntil(t.date) === 0 && !taskUrgency(t).overdue
		).length;
		const overdueInvoiceCount = invoices.filter(
			(inv) => invoiceUrgency(inv, utcToday).overdue
		).length;

		const taskParts: string[] = [];
		if (overdueTaskCount > 0) taskParts.push(`${overdueTaskCount} overdue`);
		if (todayTaskCount > 0) taskParts.push(`${todayTaskCount} today`);
		if (taskParts.length === 0 && tasks.length > 0)
			taskParts.push("due this week");

		// Remaining balance, not invoice total — partial payments already landed.
		const outstanding = invoices.reduce(
			(sum, inv) => sum + (inv.remainingBalance ?? inv.total),
			0
		);

		const expiringSoon = quotes.filter((q) => {
			if (q.validUntil === undefined) return false;
			const days = getDaysUntil(q.validUntil);
			return days >= 0 && days <= 3;
		}).length;

		return {
			isLoading,
			tasks,
			invoices,
			quotes,
			counts: {
				tasks: tasks.length,
				invoices: invoices.length,
				quotes: quotes.length,
				total: tasks.length + invoices.length + quotes.length,
			},
			summaries: {
				tasks: taskParts.join(", ") || "Nothing due",
				invoices:
					invoices.length > 0
						? `${formatCurrency(outstanding, { whole: true })} outstanding`
						: "Nothing outstanding",
				quotes:
					expiringSoon > 0
						? `${expiringSoon} expiring soon`
						: quotes.length > 0
							? "Awaiting response"
							: "Nothing pending",
			},
			overdueCount:
				overdueTaskCount +
				overdueInvoiceCount +
				quotes.filter((q) => quoteUrgency(q).overdue).length,
			getClientName: (clientId?: Id<"clients">) =>
				clientId
					? (clientNames.get(clientId) ?? "Unknown client")
					: "No client",
		};
	}, [isLoading, tasks, invoices, quotes, clientNames, utcToday]);
}
