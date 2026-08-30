/**
 * Daily org-local sweep that persists invoice lateness: `sent` invoices whose
 * due day has fully passed become `overdue`, so status_changed automations
 * (dunning) can fire on a state the UI previously only derived at read time.
 *
 * Cron flips are metering-exempt (`meter: "skip"`): ageing an already-sent
 * invoice is not a new client send. Manual flips through invoices.update keep
 * debiting.
 *
 * There is no backfill migration — the predicate is cumulative, so the first
 * run after deploy flips the whole historic backlog. What the grace window
 * below prevents is that backlog arriving as a wall of notifications and
 * dunning automations for invoices that went late months ago.
 */
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation } from "./lib/triggers";
import { transitionInvoice } from "./lib/invoiceTransitions";
import { localHourAt, localTodayUtcMidnight } from "./lib/schedule";

/**
 * Org-local hour the sweep runs at. 01:00 is the first hour of the day after
 * the due day, well before the 09:00 default automation schedule. A zone whose
 * DST spring-forward skips 01:00 misses that day's sweep; the cumulative
 * predicate picks the invoice up the next morning.
 */
const SWEEP_LOCAL_HOUR = 1;

/** Organizations read per dispatcher hop. */
const ORG_PAGE_SIZE = 200;

/**
 * Overdue invoices flipped per org run. An org with a bigger backlog catches
 * the remainder on the next daily sweep — the index range holds only flippable
 * rows, so a full window never starves the ones that just came due.
 */
const ORG_FLIP_CAP = 200;

/**
 * How late an invoice may be, in the org's own calendar days, and still
 * announce itself. Beyond this the flip is silent: no owner notification, no
 * status_changed event, so deploying the sweep can't storm an owner's bell or
 * wake dunning automations on invoices that went late months ago. A week
 * rather than "yesterday only" so a missed cron run or a backlog past
 * ORG_FLIP_CAP still surfaces genuinely fresh lateness.
 */
const OVERDUE_NOTICE_GRACE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

const SWEEP_SOURCE = "invoices.overdueSweep";

/**
 * Hourly dispatcher: schedules a per-org sweep for every org whose local wall
 * clock currently reads SWEEP_LOCAL_HOUR. Self-reschedules through the
 * organizations table so one hop stays inside transaction limits.
 */
export const sweepOverdueInvoices = internalMutation({
	args: { cursor: v.optional(v.string()) },
	returns: v.object({
		scanned: v.number(),
		dispatched: v.number(),
		isDone: v.boolean(),
	}),
	handler: async (
		ctx,
		args
	): Promise<{ scanned: number; dispatched: number; isDone: boolean }> => {
		const now = Date.now();
		const page = await ctx.db
			.query("organizations")
			.paginate({ numItems: ORG_PAGE_SIZE, cursor: args.cursor ?? null });

		let dispatched = 0;
		for (const org of page.page) {
			if (localHourAt(now, org.timezone) !== SWEEP_LOCAL_HOUR) continue;
			await ctx.scheduler.runAfter(
				0,
				internal.invoiceOverdue.sweepOrgOverdueInvoices,
				{ orgId: org._id }
			);
			dispatched++;
		}

		if (!page.isDone) {
			await ctx.scheduler.runAfter(
				0,
				internal.invoiceOverdue.sweepOverdueInvoices,
				{ cursor: page.continueCursor }
			);
		}

		return { scanned: page.page.length, dispatched, isDone: page.isDone };
	},
});

/**
 * One org's sweep. Idempotent by construction: a flipped invoice leaves the
 * `sent` index prefix, so a second run of the same day finds nothing.
 */
export const sweepOrgOverdueInvoices = internalMutation({
	args: { orgId: v.id("organizations") },
	returns: v.object({ flipped: v.number(), announced: v.number() }),
	handler: async (
		ctx,
		args
	): Promise<{ flipped: number; announced: number }> => {
		const org = await ctx.db.get(args.orgId);
		if (!org) return { flipped: 0, announced: 0 };

		const now = Date.now();
		// Due dates are UTC midnight of a calendar day, so the comparison has to
		// be against the org's own today — not Date.now(), which reads a
		// due-today invoice as late for every zone west of UTC.
		const today = localTodayUtcMidnight(now, org.timezone);
		const overdue: Doc<"invoices">[] = await ctx.db
			.query("invoices")
			.withIndex("by_status_due_date", (q) =>
				q
					.eq("orgId", args.orgId)
					.eq("status", "sent")
					.lt("dueDate", today)
			)
			.take(ORG_FLIP_CAP);

		let announced = 0;
		for (const invoice of overdue) {
			const daysLate = Math.round((today - invoice.dueDate) / DAY_MS);
			const announce = daysLate <= OVERDUE_NOTICE_GRACE_DAYS;

			await transitionInvoice(ctx, invoice, "overdue", {
				actor: "system",
				source: SWEEP_SOURCE,
				meter: "skip",
				emit: announce,
			});

			if (!announce) continue;
			await ctx.db.insert("notifications", {
				orgId: args.orgId,
				userId: org.ownerUserId,
				notificationType: "invoice_overdue",
				title: "Invoice overdue",
				message: `Invoice ${invoice.invoiceNumber} is past its due date.`,
				entityType: "invoice",
				entityId: invoice._id,
				actionUrl: `/invoices/${invoice._id}`,
				isRead: false,
				sentVia: "in_app",
				sentAt: now,
			});
			announced++;
		}

		return { flipped: overdue.length, announced };
	},
});
