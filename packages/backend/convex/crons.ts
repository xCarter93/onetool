import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Daily cleanup of archived clients that have been archived for 7+ days
crons.daily(
	"cleanup archived clients",
	{ hourUTC: 2, minuteUTC: 0 }, // Run at 2:00 AM UTC daily
	internal.clients.cleanupArchivedClients
);

// Hourly check of external service status (Convex and Clerk)
crons.hourly(
	"check service status",
	{ minuteUTC: 0 }, // Run at the top of every hour
	internal.serviceStatusActions.checkServiceStatus
);

// Backstop sweep for partial-failure org-deletion cascades.
crons.daily(
	"reconcile orphaned org data",
	{ hourUTC: 3, minuteUTC: 30 }, // Off-peak, distinct from the 02:00 cleanup
	internal.orgCascade.reconcileOrphanedOrgData
);

// Retention sweeps for the automation event bus and execution logs.
crons.daily(
	"cleanup old domain events",
	{ hourUTC: 4, minuteUTC: 0 },
	internal.eventBus.cleanupOldEvents,
	{}
);

crons.daily(
	"cleanup old workflow executions",
	{ hourUTC: 4, minuteUTC: 30 },
	internal.automationExecutor.cleanupOldExecutions,
	{}
);

// Scheduled-trigger dispatcher: runs due automations (claim-first on nextRunAt).
crons.interval(
	"dispatch scheduled automations",
	{ minutes: 15 },
	internal.automationExecutor.dispatchScheduledAutomations,
	{}
);

// Watchdog: fail dry-run test executions stuck "running" (a dropped reveal chain).
crons.interval(
	"fail stale automation test runs",
	{ minutes: 10 },
	internal.automationExecutor.failStaleTestRuns,
	{}
);

export default crons;
