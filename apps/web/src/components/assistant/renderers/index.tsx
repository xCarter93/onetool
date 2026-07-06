"use client";

import { Component, type ComponentType, type ReactNode } from "react";
import { AlertCircle, Loader2, Sparkles } from "lucide-react";
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

// Present-tense labels shown while a tool is still executing (state is
// input-streaming / input-available). Falls back to a generic label below.
const TOOL_LABELS_ACTIVE: Record<string, string> = {
	getSchedule: "Checking the schedule…",
	getTasks: "Looking up tasks…",
	getBusinessStats: "Pulling business stats…",
	runReport: "Running a report…",
	listClients: "Looking up clients…",
	getClient: "Fetching client details…",
	listProjects: "Looking up projects…",
	getProject: "Fetching project details…",
	listQuotes: "Looking up quotes…",
	getQuote: "Fetching quote details…",
	listInvoices: "Looking up invoices…",
	getInvoice: "Fetching invoice details…",
	searchClientEmails: "Searching emails…",
	getEmailThread: "Reading an email thread…",
	getDocuments: "Looking up documents…",
	getActivity: "Checking recent activity…",
	navigate: "Opening a page…",
};

function ToolChip({ name, state }: { name: string; state?: string }) {
	const failed = state === "output-error";
	// Anything that isn't a terminal state is still executing.
	const running = state !== "output-available" && state !== "output-error";
	return (
		<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
			{failed ? (
				<AlertCircle className="size-3" />
			) : running ? (
				<Loader2 className="size-3 animate-spin" />
			) : (
				<Sparkles className="size-3" />
			)}
			{failed
				? `Hit a snag: ${(TOOL_LABELS[name] ?? name).toLowerCase()}`
				: running
					? (TOOL_LABELS_ACTIVE[name] ?? `Working on ${name}…`)
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
