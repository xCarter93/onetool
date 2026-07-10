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

// One entry per tool holds both label forms so the two can never drift:
// `active` shows while the tool is executing (state input-streaming /
// input-available), `done` once it has finished.
export const TOOL_LABELS: Record<string, { done: string; active: string }> = {
	getSchedule: { done: "Checked the schedule", active: "Checking the schedule…" },
	getTasks: { done: "Looked up tasks", active: "Looking up tasks…" },
	getBusinessStats: {
		done: "Pulled business stats",
		active: "Pulling business stats…",
	},
	runReport: { done: "Ran a report", active: "Running a report…" },
	createReport: { done: "Created a report", active: "Creating a report…" },
	configureReport: {
		done: "Updated the report builder",
		active: "Configuring the report…",
	},
	listClients: { done: "Looked up clients", active: "Looking up clients…" },
	getClient: { done: "Fetched client details", active: "Fetching client details…" },
	listProjects: { done: "Looked up projects", active: "Looking up projects…" },
	getProject: {
		done: "Fetched project details",
		active: "Fetching project details…",
	},
	listQuotes: { done: "Looked up quotes", active: "Looking up quotes…" },
	getQuote: { done: "Fetched quote details", active: "Fetching quote details…" },
	listInvoices: { done: "Looked up invoices", active: "Looking up invoices…" },
	getInvoice: { done: "Fetched invoice details", active: "Fetching invoice details…" },
	searchClientEmails: { done: "Searched emails", active: "Searching emails…" },
	getEmailThread: {
		done: "Read an email thread",
		active: "Reading an email thread…",
	},
	getDocuments: { done: "Looked up documents", active: "Looking up documents…" },
	getActivity: { done: "Checked recent activity", active: "Checking recent activity…" },
	navigate: { done: "Opened a page", active: "Opening a page…" },
};

function ToolChip({ name, state }: { name: string; state?: string }) {
	const failed = state === "output-error";
	// Anything that isn't a terminal state is still executing.
	const running = state !== "output-available" && state !== "output-error";
	const label = TOOL_LABELS[name];
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
				? `Hit a snag: ${(label?.done ?? name).toLowerCase()}`
				: running
					? (label?.active ?? `Working on ${name}…`)
					: (label?.done ?? `Used ${name}`)}
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
