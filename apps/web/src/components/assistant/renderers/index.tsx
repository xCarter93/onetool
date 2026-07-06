"use client";

import { Component, type ComponentType, type ReactNode } from "react";
import { AlertCircle, Sparkles } from "lucide-react";
import { EmailsRenderer } from "./emails-renderer";
import { NavigateRenderer } from "./navigate-renderer";
import { ReportRenderer } from "./report-renderer";
import { ScheduleRenderer } from "./schedule-renderer";

/**
 * Generative-UI registry: tool results that have a first-party renderer show
 * as real UI in the transcript; everything else falls back to a ToolChip.
 */

// Minimal shape of an AI SDK ToolUIPart as surfaced by @convex-dev/agent.
export interface AssistantToolPart {
	type: string;
	toolCallId?: string;
	state?: string;
	input?: unknown;
	output?: unknown;
}

export interface ToolRendererProps {
	input: unknown;
	output: unknown;
}

const TOOL_RENDERERS: Record<string, ComponentType<ToolRendererProps>> = {
	runReport: ReportRenderer,
	getSchedule: ScheduleRenderer,
	searchClientEmails: EmailsRenderer,
	navigate: NavigateRenderer,
};

export const TOOL_LABELS: Record<string, string> = {
	getSchedule: "Checked the schedule",
	getTasks: "Looked up tasks",
	getBusinessStats: "Pulled business stats",
	runReport: "Ran a report",
	listClients: "Looked up clients",
	getClient: "Fetched client details",
	listProjects: "Looked up projects",
	getProject: "Fetched project details",
	listQuotes: "Looked up quotes",
	getQuote: "Fetched quote details",
	listInvoices: "Looked up invoices",
	getInvoice: "Fetched invoice details",
	searchClientEmails: "Searched emails",
	getEmailThread: "Read an email thread",
	getDocuments: "Looked up documents",
	getActivity: "Checked recent activity",
	navigate: "Opened a page",
};

function ToolChip({ name, state }: { name: string; state?: string }) {
	const failed = state === "output-error";
	return (
		<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
			{failed ? (
				<AlertCircle className="size-3" />
			) : (
				<Sparkles className="size-3" />
			)}
			{failed
				? `Hit a snag: ${(TOOL_LABELS[name] ?? name).toLowerCase()}`
				: (TOOL_LABELS[name] ?? `Used ${name}`)}
		</div>
	);
}

// Renderers consume untyped tool output — a malformed payload must degrade
// to the chip, not take down the whole sheet.
class RendererErrorBoundary extends Component<
	{ fallback: ReactNode; children: ReactNode },
	{ failed: boolean }
> {
	state = { failed: false };
	static getDerivedStateFromError() {
		return { failed: true };
	}
	render() {
		return this.state.failed ? this.props.fallback : this.props.children;
	}
}

export function ToolPartRenderer({ part }: { part: AssistantToolPart }) {
	const name = part.type.replace(/^tool-/, "");
	const Renderer = TOOL_RENDERERS[name];
	if (
		Renderer &&
		part.state === "output-available" &&
		part.output !== undefined
	) {
		return (
			<RendererErrorBoundary
				fallback={<ToolChip name={name} state="output-error" />}
			>
				<Renderer input={part.input} output={part.output} />
			</RendererErrorBoundary>
		);
	}
	return <ToolChip name={name} state={part.state} />;
}
