import { Migrations } from "@convex-dev/migrations";
import { components } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { DataModel } from "../_generated/dataModel";

/**
 * Migration: Backfill existing automation triggers with type: "status_changed"
 *
 * All existing automations use the legacy trigger format (no type field).
 * This migration adds `type: "status_changed"` to each trigger since
 * that's the only trigger type that existed before v1.2.
 *
 * To run:
 *   npx convex run migrations:run '{"fn": "migrations/migrateAutomationTriggers:migrateAutomationTriggers"}'
 */

const migrations = new Migrations<DataModel>(components.migrations, {
	internalMutation,
});

export const run = migrations.runner();

export const migrateAutomationTriggers = migrations.define({
	table: "workflowAutomations",
	migrateOne: async (_ctx, doc) => {
		// Skip if already has type field (already migrated)
		if ("type" in doc.trigger) {
			return;
		}

		// Backfill with type: "status_changed" since all existing automations
		// use the status_changed trigger pattern
		return {
			trigger: {
				type: "status_changed" as const,
				objectType: doc.trigger.objectType,
				fromStatus: doc.trigger.fromStatus,
				toStatus: (doc.trigger as { toStatus: string }).toStatus,
			},
		};
	},
});
