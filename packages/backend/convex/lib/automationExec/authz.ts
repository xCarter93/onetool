import type { PermissionObject } from "../permissionKeys";
import type { UserMutationCtx, UserQueryCtx } from "../factories";
import {
	triggerRecordObjectType,
	type AutomationObjectType,
	type AutomationTrigger,
	type FormulaResource,
} from "../workflowTypes";
import type { WorkflowNodeConfig } from "../workflowTypes";
import { collectRelationRefs } from "../relationRefs";
import type { Doc } from "../../_generated/dataModel";
import { permissionsEnforced } from "../permissions";

/**
 * The shape `collectDefinitionObjectTypes` needs from a node. Deliberately
 * structural so both the stored `Doc<"workflowAutomations">["nodes"]` rows and
 * the mutation arg type satisfy it without a cast.
 */
export type DefinitionNode = {
	id: string;
	config: WorkflowNodeConfig;
	nextNodeId?: string;
	elseNodeId?: string;
	bodyStartNodeId?: string;
	mergeNodeId?: string;
};

/**
 * Permission object for an automation object type.
 *
 * `ENTITY_PERMISSION_OBJECT` is keyed by *activity* entity type, so the two
 * fetch-only line-item types are absent from it. They must map to their parent
 * record's object or a fetch+aggregate over them is an ungated read of quote
 * and invoice money.
 */
const AUTOMATION_PERMISSION_OBJECT: Record<
	AutomationObjectType,
	PermissionObject
> = {
	client: "clients",
	project: "projects",
	quote: "quotes",
	invoice: "invoices",
	task: "tasks",
	quote_line_item: "quotes",
	invoice_line_item: "invoices",
};

/**
 * Which loop-body nodes act on which fetched type. A `target: "self"` action
 * inside a loop body writes the loop's item, not the trigger record. Bounded by
 * a visited set so it terminates on cyclic input (cycles are rejected
 * separately by validateWorkflowDefinition).
 */
export function computeLoopBodyScopeTypes(
	nodes: DefinitionNode[]
): Map<string, AutomationObjectType | undefined> {
	const byId = new Map(nodes.map((n) => [n.id, n]));
	const bodyScopeType = new Map<string, AutomationObjectType | undefined>();
	for (const loop of nodes) {
		if (loop.config.kind !== "loop") continue;
		const fetchNode = byId.get(loop.config.sourceNodeId);
		const fetchType =
			fetchNode?.config.kind === "fetch_records"
				? fetchNode.config.objectType
				: undefined;
		const stack =
			loop.bodyStartNodeId === undefined ? [] : [loop.bodyStartNodeId];
		const seen = new Set<string>();
		while (stack.length > 0) {
			const id = stack.pop()!;
			if (seen.has(id)) continue;
			seen.add(id);
			bodyScopeType.set(id, fetchType);
			const member = byId.get(id);
			if (member?.nextNodeId !== undefined) stack.push(member.nextNodeId);
			if (member?.elseNodeId !== undefined) stack.push(member.elseNodeId);
			if (member?.mergeNodeId !== undefined) stack.push(member.mergeNodeId);
		}
	}
	return bodyScopeType;
}

/**
 * Every object type a definition reads from, and every one it writes to.
 *
 * The entry points gate the *record* a run starts on, but that is not the whole
 * surface: a `fetch_records` node walks `by_org` for an arbitrary object type
 * and never passes a record gate, and `create_record`/`update_field` write one
 * gated only by `fieldDef.writable`. Without this, `automations:modify` alone
 * still buys org-wide read and write.
 */
export function collectDefinitionObjectTypes(
	trigger: AutomationTrigger,
	nodes: DefinitionNode[],
	formulas?: FormulaResource[]
): { reads: Set<AutomationObjectType>; writes: Set<AutomationObjectType> } {
	const reads = new Set<AutomationObjectType>();
	const writes = new Set<AutomationObjectType>();

	const triggerType = triggerRecordObjectType(trigger);
	if (triggerType) reads.add(triggerType);

	const bodyScopeType = computeLoopBodyScopeTypes(nodes);

	/** A `{related: X}` target both reads X and, for writes, patches it. */
	const noteTarget = (
		target: unknown,
		nodeId: string,
		into: Set<AutomationObjectType>
	) => {
		if (target && typeof target === "object" && "related" in target) {
			const related = (target as { related: AutomationObjectType }).related;
			into.add(related);
			reads.add(related);
			return;
		}
		const scoped = bodyScopeType.get(nodeId) ?? triggerType;
		if (scoped) into.add(scoped);
	};

	for (const node of nodes) {
		const config = node.config;
		if (!config) continue;

		if (config.kind === "fetch_records") {
			reads.add(config.objectType);
			continue;
		}
		if (config.kind !== "action") continue;

		const action = config.action;
		switch (action.type) {
			case "create_record":
				writes.add(action.objectType);
				break;
			case "create_task":
				writes.add("task");
				break;
			case "update_field":
			case "update_fields":
				noteTarget(action.target, node.id, writes);
				break;
			case "send_team_message":
				// Posts to the resolved record's feed: reads it and attaches to it.
				noteTarget(action.target, node.id, writes);
				break;
			case "send_notification": {
				const recipient = action.recipient;
				if (
					recipient &&
					typeof recipient === "object" &&
					"recordField" in recipient
				) {
					noteTarget(recipient.recordField.target, node.id, reads);
				}
				break;
			}
			case "send_email":
				// Resolves scope record -> client -> clientContacts to address it.
				reads.add("client");
				break;
		}
	}

	// One-hop relation reads: `{{trigger.record.client.portalAccessId}}` in a
	// message, a dotted condition rule, or a formula all resolve the related
	// record at run time, so the relation's own type must be granted too.
	const refs = collectRelationRefs(nodes, trigger, formulas);
	const relationNames = [
		...refs.trigger,
		...[...refs.loops.values()].flatMap((names) => [...names]),
	];
	for (const name of relationNames) {
		if (isAutomationObjectType(name)) reads.add(name);
	}

	for (const type of writes) reads.add(type);
	return { reads, writes };
}

function isAutomationObjectType(name: string): name is AutomationObjectType {
	return name in AUTOMATION_PERMISSION_OBJECT;
}

/**
 * Gate a definition's referenced object types against the author's grants.
 *
 * Requires `allRecords` on every referenced type, not merely a level: an
 * automation is org-wide by construction — `findMatchingAutomations` fires it
 * for every matching record in the org and `fetch_records` walks `by_org` with
 * no record-scope filter — so a caller who can only see their own assignments
 * must not be able to author or run one that touches the rest. Owners and
 * admins resolve to "all" grants and are unaffected.
 */
export async function requireDefinitionObjectAccess(
	ctx: UserQueryCtx | UserMutationCtx,
	trigger: AutomationTrigger,
	nodes: DefinitionNode[],
	// Load-bearing: a formula is a second way to reach a relation
	// (`f1 = trigger.record.client.portalAccessId`), and the executor hydrates
	// formula relation refs at run time. Omitting it makes the gate asymmetric —
	// the same payload written inline is caught, via a formula is not.
	formulas?: FormulaResource[]
): Promise<void> {
	const { reads, writes } = collectDefinitionObjectTypes(
		trigger,
		nodes,
		formulas
	);

	for (const type of writes) await gateObject(ctx, type, "modify");
	for (const type of reads) {
		if (writes.has(type)) continue;
		await gateObject(ctx, type, "view");
	}
}

async function gateObject(
	ctx: UserQueryCtx | UserMutationCtx,
	type: AutomationObjectType,
	level: "view" | "modify"
): Promise<void> {
	const permissionObject = AUTOMATION_PERMISSION_OBJECT[type];
	if (!permissionObject) {
		throw new Error(`Unsupported automation object type: ${type}`);
	}
	await ctx.requireLevel(permissionObject, level);
	// Denies unless the caller holds allRecords (requireRecordScope
	// short-circuits for hasAllRecords and otherwise runs this predicate).
	await ctx.requireRecordScope(permissionObject, () => false);
}

/**
 * Object types a stored automation can touch, across BOTH its working copy and
 * its published snapshot.
 *
 * A test run executes the working copy while a production run executes the
 * snapshot, and a stored run row can have come from either — so gating a read
 * on one alone under-protects rows produced by the other.
 */
function storedDefinitionObjectTypes(automation: Doc<"workflowAutomations">): {
	reads: Set<AutomationObjectType>;
	writes: Set<AutomationObjectType>;
} {
	const combined = collectDefinitionObjectTypes(
		automation.trigger as AutomationTrigger,
		automation.nodes as DefinitionNode[],
		automation.formulas
	);
	const snapshot = automation.publishedSnapshot;
	if (snapshot) {
		const fromSnapshot = collectDefinitionObjectTypes(
			snapshot.trigger as AutomationTrigger,
			snapshot.nodes as DefinitionNode[],
			snapshot.formulas
		);
		for (const type of fromSnapshot.reads) combined.reads.add(type);
		for (const type of fromSnapshot.writes) combined.writes.add(type);
	}
	return combined;
}

/**
 * May the caller see a run's per-node snapshots?
 *
 * Run rows carry `input`/`output` values interpolated from the records the
 * automation touched, so `automations:view` alone is not enough — the caller
 * needs the same object grants that authoring or running it requires.
 */
export async function canReadExecutionDetail(
	ctx: UserQueryCtx | UserMutationCtx,
	automation: Doc<"workflowAutomations">
): Promise<boolean> {
	// Shadow mode hides nothing anywhere else (applyReadScope returns every row),
	// so this verdict must not be the one exception.
	if (!permissionsEnforced()) return true;
	const { reads, writes } = storedDefinitionObjectTypes(automation);
	for (const type of new Set([...reads, ...writes])) {
		const permissionObject = AUTOMATION_PERMISSION_OBJECT[type];
		if (!permissionObject) return false;
		if (!(await ctx.can(permissionObject, "view"))) return false;
		if (!(await ctx.hasAllRecords(permissionObject))) return false;
	}
	return true;
}

/** Throwing form of {@link canReadExecutionDetail}. */
export async function requireExecutionReadAccess(
	ctx: UserQueryCtx | UserMutationCtx,
	automation: Doc<"workflowAutomations">
): Promise<void> {
	const { reads, writes } = storedDefinitionObjectTypes(automation);
	for (const type of writes) await gateObject(ctx, type, "modify");
	for (const type of reads) {
		if (writes.has(type)) continue;
		await gateObject(ctx, type, "view");
	}
}
