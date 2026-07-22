import { Doc, Id } from "../../_generated/dataModel";
import type { VariableScope } from "../conditionEval";
import type { RelationRefs } from "../relationRefs";
import type {
	AutomationObjectType,
	LoopSummary,
	TriggerableObjectType,
} from "../workflowTypes";

/**
 * A record type the engine can act on: trigger, target, emit events about,
 * link a notification to. Excludes fetch-only line items by construction — the
 * fetch/aggregate surfaces below say AutomationObjectType explicitly.
 */
export type ObjectType = TriggerableObjectType;
export type AutomationNode = Doc<"workflowAutomations">["nodes"][number];
export type AutomationDoc = Doc<"workflowAutomations">;

/** The record a node operates on: the trigger record, or a loop item. */
export type ScopeRecord = {
	type: TriggerableObjectType;
	id: string;
	record: Record<string, unknown>;
};

export type FetchOutput = {
	objectType: AutomationObjectType;
	records: Record<string, unknown>[];
	count: number;
	/** True when the scan stopped at its cap with org rows still unscanned. */
	truncated: boolean;
};

export type ExecEntry = Doc<"workflowExecutions">["nodesExecuted"][number];

export type WalkEnv = {
	executionId: Id<"workflowExecutions">;
	automation: AutomationDoc;
	nodesById: Map<string, AutomationNode>;
	orgId: Id<"organizations">;
	executionChain: Id<"workflowAutomations">[];
	recursionDepth: number;
	scope: VariableScope;
	fetchOutputs: Record<string, FetchOutput>;
	nodesExecuted: ExecEntry[];
	logTruncated: boolean;
	/** True once any fetch in this run stopped before considering every row. */
	dataTruncated: boolean;
	/** Rows this walk may still scan across all its fetches (WALK_SCAN_BUDGET). */
	fetchScanBudget: number;
	/** One-hop relation references statically collected from the definition. */
	relationRefs: RelationRefs;
	/** Per-run memo of hydrated related docs, keyed `type:id`. */
	relationCache: Map<string, Record<string, unknown> | null>;
	/** Original trigger reference, persisted into resumeState for delays. */
	trigger: { objectType?: ObjectType; objectId?: string };
	/** Wall-clock start of the node currently executing; stamped onto each entry. */
	nodeStartedAt: number;
	/** True for real runs (not test/dry); gates failure notifications. */
	isProduction: boolean;
	/**
	 * Per-loop item tallies, keyed by loop node id and carried across chunk
	 * boundaries via workflowExecutions.loopSummary. Authoritative — the entry
	 * log truncates and compacts, these counts never do.
	 */
	loopSummaries: LoopSummary[];
	/** The loop iteration currently executing; stamps identity onto its entries. */
	currentLoop?: {
		nodeId: string;
		index: number;
		itemId: string;
		label?: string;
	};
};
