"use client";

import type { Route } from "next";
import Link from "next/link";
import type { ComponentType } from "react";
import { StatusBadge } from "@/components/domain/status-badge";
import { formatCurrency } from "@/lib/money";
import type { ToolRendererProps } from "./index";

const ROW_CAP = 8;

interface Row {
	id: string;
	primary: string;
	secondary?: string;
	status?: string;
	amount?: number;
	href?: string;
}

interface CappedOutput {
	items: unknown[];
	totalCount?: number;
}

function humanize(value: string) {
	return value.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
}

// isoDay strings parse as UTC midnight — format in UTC to avoid an off-by-one day.
function formatDay(day: string) {
	return new Date(day).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	});
}

function RowLine({ row }: { row: Row }) {
	const body = (
		<div className="flex items-center justify-between gap-3 py-1.5">
			<div className="min-w-0">
				<p className="truncate text-sm text-foreground">{row.primary}</p>
				{row.secondary && (
					<p className="truncate text-xs text-muted-foreground">{row.secondary}</p>
				)}
			</div>
			<div className="flex shrink-0 flex-col items-end gap-1">
				{row.amount !== undefined && (
					<span className="text-sm text-foreground tabular-nums">
						{formatCurrency(row.amount)}
					</span>
				)}
				{row.status && (
					<StatusBadge status={row.status} size="sm">
						{humanize(row.status)}
					</StatusBadge>
				)}
			</div>
		</div>
	);
	if (!row.href) return body;
	return (
		<Link
			href={row.href as Route}
			className="-mx-1 block rounded-md px-1 transition-colors duration-150 hover:bg-muted/40"
		>
			{body}
		</Link>
	);
}

function createRecordListRenderer<T>(config: {
	emptyLabel: string;
	toRow: (item: T) => Row;
}): ComponentType<ToolRendererProps> {
	return function RecordListRenderer({ output }: ToolRendererProps) {
		const result = output as CappedOutput | undefined;
		const items = Array.isArray(result?.items) ? (result.items as T[]) : [];

		if (items.length === 0) {
			return (
				<div className="rounded-xl border border-border bg-muted/20 px-3.5 py-2.5 text-xs text-muted-foreground">
					{config.emptyLabel}
				</div>
			);
		}

		const shown = Math.min(items.length, ROW_CAP);
		const hidden = Math.max(result?.totalCount ?? items.length, items.length) - shown;

		return (
			<div className="rounded-xl border border-border bg-card px-3.5 py-1">
				<div className="divide-y divide-border/60">
					{items.slice(0, ROW_CAP).map((item) => {
						const row = config.toRow(item);
						return <RowLine key={row.id} row={row} />;
					})}
				</div>
				{hidden > 0 && (
					<p className="pb-2 pt-1 text-xs text-muted-foreground">+{hidden} more</p>
				)}
			</div>
		);
	};
}

// Mirrors ClientListItem in convex/assistantTools.ts.
interface ClientListItem {
	id: string;
	companyName: string;
	status: string;
	leadSource?: string;
}

export const ClientsRenderer = createRecordListRenderer<ClientListItem>({
	emptyLabel: "No clients found.",
	toRow: (client) => ({
		id: client.id,
		primary: client.companyName,
		secondary: client.leadSource ? humanize(client.leadSource) : undefined,
		status: client.status,
		href: `/clients/${client.id}`,
	}),
});

// Mirrors ProjectItem in convex/assistantTools.ts.
interface ProjectItem {
	id: string;
	title: string;
	projectNumber?: string;
	status: string;
	projectType: string;
}

export const ProjectsRenderer = createRecordListRenderer<ProjectItem>({
	emptyLabel: "No projects found.",
	toRow: (project) => ({
		id: project.id,
		primary: project.title,
		secondary: project.projectNumber
			? `#${project.projectNumber}`
			: humanize(project.projectType),
		status: project.status,
		href: `/projects/${project.id}`,
	}),
});

// Mirrors QuoteItem in convex/assistantTools.ts. Amounts are dollars.
interface QuoteItem {
	id: string;
	quoteNumber?: string;
	title?: string;
	status: string;
	total: number;
	validUntil?: string;
}

export const QuotesRenderer = createRecordListRenderer<QuoteItem>({
	emptyLabel: "No quotes found.",
	toRow: (quote) => ({
		id: quote.id,
		primary:
			quote.title?.trim() ||
			(quote.quoteNumber ? `Quote ${quote.quoteNumber}` : "Untitled quote"),
		secondary:
			quote.title && quote.quoteNumber
				? `#${quote.quoteNumber}`
				: quote.validUntil
					? `Valid until ${formatDay(quote.validUntil)}`
					: undefined,
		status: quote.status,
		amount: quote.total,
		href: `/quotes/${quote.id}`,
	}),
});

// Mirrors InvoiceItem in convex/assistantTools.ts. Amounts are dollars.
interface InvoiceItem {
	id: string;
	invoiceNumber: string;
	status: string;
	total: number;
	issuedDate?: string;
	dueDate?: string;
}

export const InvoicesRenderer = createRecordListRenderer<InvoiceItem>({
	emptyLabel: "No invoices found.",
	toRow: (invoice) => ({
		id: invoice.id,
		primary: `Invoice ${invoice.invoiceNumber}`,
		secondary: invoice.dueDate
			? `Due ${formatDay(invoice.dueDate)}`
			: invoice.issuedDate
				? `Issued ${formatDay(invoice.issuedDate)}`
				: undefined,
		status: invoice.status,
		amount: invoice.total,
		href: `/invoices/${invoice.id}`,
	}),
});

// Mirrors SkuItem in convex/assistantTools.ts. No detail route, so rows are not links.
interface SkuItem {
	id: string;
	name: string;
	unit: string;
	rate: number;
	isActive: boolean;
}

export const SkusRenderer = createRecordListRenderer<SkuItem>({
	emptyLabel: "No services found.",
	toRow: (sku) => ({
		id: sku.id,
		primary: sku.name,
		secondary: sku.unit,
		status: sku.isActive ? "active" : "inactive",
		amount: sku.rate,
	}),
});

// Mirrors TeamMemberItem in convex/assistantTools.ts. No detail route, so rows are not links.
interface TeamMemberItem {
	id: string;
	name: string;
	email: string;
}

export const TeamMembersRenderer = createRecordListRenderer<TeamMemberItem>({
	emptyLabel: "No team members found.",
	toRow: (member) => ({
		id: member.id,
		primary: member.name,
		secondary: member.email,
	}),
});
