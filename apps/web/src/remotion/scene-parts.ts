import type React from "react";
import type { FeatureKey } from "./manifest";
import type { SceneShell } from "./ui/scene-shell";
import { ASSISTANT_SHELL, AssistantContent } from "./scenes/assistant";
import { AUTOMATIONS_SHELL, AutomationsContent } from "./scenes/automations";
import { CLIENTS_SHELL, ClientsContent } from "./scenes/clients";
import { INVOICE_PAID_SHELL, InvoicePaidContent } from "./scenes/invoice-paid";
import { PORTAL_APPROVE_SHELL, PortalApproveContent } from "./scenes/portal-approve";
import { QUOTE_BUILD_SHELL, QuoteBuildContent } from "./scenes/quote-build";
import { REPORTS_SHELL, ReportsContent } from "./scenes/reports";
import { ROUTING_SHELL, RoutingContent } from "./scenes/routing";
import { TASKS_SHELL, TasksScheduleContent } from "./scenes/tasks-schedule";

export interface ScenePart {
	/**
	 * What renders inside the shell's canvas slot — or, for a `layout: "full"`
	 * chapter, the whole 1600×1000 stage.
	 */
	Content: React.FC;
	/**
	 * Shell description. Full-bleed chapters still carry one (their standalone
	 * composition may frame them), but the reel never reads it.
	 */
	shell: SceneShell;
}

/**
 * Scene-side registry — the reel is the one place that needs every scene at
 * once, so this module (and only this module) is allowed to import them all.
 * Page-side code must never reach here; it goes through `manifest.ts`.
 */
export const SCENE_PARTS: Record<FeatureKey, ScenePart> = {
	clients: { Content: ClientsContent, shell: CLIENTS_SHELL },
	"quote-build": { Content: QuoteBuildContent, shell: QUOTE_BUILD_SHELL },
	"portal-approve": { Content: PortalApproveContent, shell: PORTAL_APPROVE_SHELL },
	tasks: { Content: TasksScheduleContent, shell: TASKS_SHELL },
	routing: { Content: RoutingContent, shell: ROUTING_SHELL },
	"invoice-paid": { Content: InvoicePaidContent, shell: INVOICE_PAID_SHELL },
	automations: { Content: AutomationsContent, shell: AUTOMATIONS_SHELL },
	assistant: { Content: AssistantContent, shell: ASSISTANT_SHELL },
	reports: { Content: ReportsContent, shell: REPORTS_SHELL },
};
