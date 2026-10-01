import { createContext, useContext } from "react";
import type { NodeRunStatus } from "../../lib/run-status";

/** Per-node statuses of the run shown on the canvas; null when there is no run. */
export const RunStatusContext = createContext<Record<string, NodeRunStatus> | null>(null);

export function useRunStatuses(): Record<string, NodeRunStatus> | null {
	return useContext(RunStatusContext);
}
