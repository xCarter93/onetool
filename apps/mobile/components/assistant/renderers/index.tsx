import { Component, type ComponentType, type ReactNode } from "react";
import { SearchHelpRenderer } from "./help";
import {
	ClientsRenderer,
	EmailsRenderer,
	InvoicesRenderer,
	ProjectsRenderer,
	QuotesRenderer,
	ScheduleRenderer,
	SkusRenderer,
	TeamMembersRenderer,
} from "./lists";
import { ToolChip } from "./panel";
import { ReportRenderer } from "./report";
import { BusinessStatsRenderer } from "./stats";

export { ResultPanel, ToolChip } from "./panel";

// Mirrors web's TOOL_RENDERERS (apps/web/src/components/assistant/renderers);
// navigate and configureReport are handled in message-parts with mobile copy.
const TOOL_RENDERERS: Record<string, ComponentType<{ output: unknown }>> = {
	runReport: ReportRenderer,
	getSchedule: ScheduleRenderer,
	searchClientEmails: EmailsRenderer,
	getBusinessStats: BusinessStatsRenderer,
	searchHelp: SearchHelpRenderer,
	listClients: ClientsRenderer,
	listProjects: ProjectsRenderer,
	listQuotes: QuotesRenderer,
	listInvoices: InvoicesRenderer,
	listSkus: SkusRenderer,
	getTeamMembers: TeamMembersRenderer,
};

// Tool output is untyped — a malformed payload degrades to the chip instead of
// taking down the whole transcript.
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

export function ToolResult({
	name,
	state,
	output,
}: {
	name: string;
	state?: string;
	output: unknown;
}) {
	const Renderer = TOOL_RENDERERS[name];
	if (!Renderer || state !== "output-available" || output === undefined) {
		return <ToolChip name={name} state={state} />;
	}
	return (
		<RendererErrorBoundary fallback={<ToolChip name={name} state="output-error" />}>
			<Renderer output={output} />
		</RendererErrorBoundary>
	);
}
