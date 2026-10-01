import { createContext, useContext } from "react";
import type { NodeRunResult, NodeRunStatus } from "../../lib/run-status";

export type CanvasRun = {
	statuses: Record<string, NodeRunStatus>;
	results: Record<string, NodeRunResult>;
	/** True while the run is still executing. */
	live: boolean;
};

/** The run shown on the canvas; null when there is no run. */
export const RunStatusContext = createContext<CanvasRun | null>(null);

export function useCanvasRun(): CanvasRun | null {
	return useContext(RunStatusContext);
}
