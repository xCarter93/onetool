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

// Watchdog: fail production runs stranded by a dropped scheduler hop —
// stuck mid-walk or never woken from a parked delay/loop checkpoint.
crons.interval(
	"fail stale automation production runs",
	{ minutes: 15 },
	internal.automationExecutor.failStaleProductionRuns,
	{}
);

// Event bus backlog safety net: rescues a pending backlog if a scheduled
// processEvents wake was dropped and no new emit arrives to re-claim it.
crons.interval(
	"kick event processing",
	{ minutes: 5 },
	internal.eventBus.kickEventProcessing,
	{}
);

// Repair billing mirrors a missed Clerk webhook left stale (>48h unwritten).
crons.daily(
	"reconcile stale billing mirrors",
	{ hourUTC: 5, minuteUTC: 0 },
	internal.billingReconcile.reconcileStaleBillingMirrors,
	{}
);

// Keep QuickBooks tokens warm and surface dead grants as needs_reauth.
crons.interval(
	"refresh stale quickbooks connections",
	{ hours: 6 },
	internal.quickbooksActions.refreshStaleConnections,
	{}
);

// Sync-queue watchdog: reclaim jobs stranded mid-claim and re-kick orgs whose
// scheduler hop was dropped.
crons.interval(
	"sweep quickbooks sync jobs",
	{ minutes: 15 },
	internal.quickbooksActions.sweepSyncJobs,
	{}
);

// Attachment downloads whose pool job vanished. Hourly, because Resend's
// signed download_url lives an hour and a re-enqueue mints a fresh one.
crons.interval(
	"reconcile stuck attachment downloads",
	{ hours: 1 },
	internal.externalFetchReconcile.reconcileStuckAttachments,
	{}
);

// Persist invoice lateness. Hourly because the dispatcher picks the orgs whose
// LOCAL clock reads SWEEP_LOCAL_HOUR; each org is swept once per day.
crons.hourly(
	"sweep overdue invoices",
	{ minuteUTC: 10 },
	internal.invoiceOverdue.sweepOverdueInvoices,
	{}
);

// Backstop for signed PDFs that gave up without the completion hook telling
// anyone. Daily is enough: nobody is waiting on this in real time.
crons.daily(
	"reconcile failed signed pdf downloads",
	{ hourUTC: 5, minuteUTC: 30 },
	internal.externalFetchReconcile.reconcileFailedSignedPdfs,
	{}
);

export default crons;
