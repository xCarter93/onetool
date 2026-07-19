import {
	collectReferencedPaths,
	parseFormula,
} from "@onetool/backend/convex/lib/formula";
import { collectLoopBody } from "./graph-utils";
import {
	OBJECT_TYPE_LABELS,
	RELATED_OBJECTS,
	getFilterableFields,
	isFetchOnlyObjectType,
	type AutomationObjectType,
	type TriggerableObjectType,
	type AutomationTrigger,
	type FetchNodeConfig,
	type FieldDefinition,
	type FieldType,
	type FormulaResource,
	type LoopNodeConfig,
	type TriggerConfig,
	type WorkflowNode,
} from "./node-types";

/**
 * Resolves which `{{path}}` variables are available at a given point in the
 * workflow graph, for the "Use a variable" popover (value-input.tsx) and the
 * loop "records to loop over" picker.
 *
 * Mirrors the variable paths the engine resolves at run time (see
 * workflowTypes.ts header comment): trigger.record.<field>,
 * trigger.event.oldValue/newValue, node.<fetchNodeId>.count, and
 * loop.<loopNodeId>.item.<field>/.index.
 */

export type VariableOption = {
	path: string;
	label: string;
	group: string;
	fieldType?: FieldType;
	/** For an `id`-typed option, the entity it points at — lets the picker flag e.g. a client id fed into a user id field. */
	refType?: FieldDefinition["refType"];
	/** The option holds an array — feeding it a single-valued field uses the first element. */
	isArray?: boolean;
	/**
	 * Set on one-hop relation options — drives the picker's drill-down page.
	 * key = the relation objectType (e.g. "client"), label = its display name.
	 */
	relation?: { key: string; label: string };
};

function childrenOf(node: WorkflowNode): string[] {
	const out: string[] = [];
	if (node.nextNodeId) out.push(node.nextNodeId);
	if (node.elseNodeId) out.push(node.elseNodeId);
	if (node.bodyStartNodeId) out.push(node.bodyStartNodeId);
	return out;
}

/**
 * True if targetId is reachable from startId by walking nextNodeId /
 * elseNodeId / bodyStartNodeId chains (i.e. targetId runs "after" startId).
 */
function isReachableFrom(
	startId: string,
	targetId: string,
	byId: Map<string, WorkflowNode>
): boolean {
	if (startId === targetId) return false;
	const visited = new Set<string>([startId]);
	const queue: string[] = [startId];

	while (queue.length > 0) {
		const current = queue.shift()!;
		const node = byId.get(current);
		if (!node) continue;
		for (const child of childrenOf(node)) {
			if (child === targetId) return true;
			if (!visited.has(child)) {
				visited.add(child);
				queue.push(child);
			}
		}
	}
	return false;
}

/** Fetch nodes reachable to targetNodeId — used by the loop config's source picker. */
export function getUpstreamFetchNodes(
	nodes: WorkflowNode[],
	targetNodeId: string
): { id: string; objectType: AutomationObjectType | undefined }[] {
	const byId = new Map(nodes.map((n) => [n.id, n]));
	return nodes
		.filter(
			(node) =>
				node.type === "fetch_records" &&
				isReachableFrom(node.id, targetNodeId, byId)
		)
		.map((node) => ({
			id: node.id,
			objectType: (node.config as FetchNodeConfig | undefined)?.objectType,
		}));
}

/**
 * The object type an action/condition node resolves to at run time: the
 * loop's fetched item type when the node sits inside a loop body, otherwise
 * the trigger object type. Mirrors the backend's computeLoopBodyScopeTypes
 * (automations.ts) so the builder offers the same fields the engine will read
 * or write.
 *
 * `inLoop` lets the panel relabel "self" as the current loop item.
 * `loopNodeId` is the enclosing loop's node id — used to build
 * `ConditionNodeConfig.source: { loopNodeId }`.
 */
export function getScopeObjectType(
	nodes: WorkflowNode[],
	targetNodeId: string,
	triggerObjectType: TriggerableObjectType | null
): {
	objectType: TriggerableObjectType | null;
	inLoop: boolean;
	loopNodeId: string | null;
} {
	for (const node of nodes) {
		if (node.type !== "loop") continue;
		// The loop node itself runs in the enclosing (trigger) scope, not its body.
		if (node.id === targetNodeId) continue;
		const config = node.config as LoopNodeConfig | undefined;
		if (!config?.sourceNodeId) continue;

		const body = collectLoopBody(node.id, nodes);
		if (!body.has(targetNodeId)) continue;

		const sourceNode = nodes.find((n) => n.id === config.sourceNodeId);
		const sourceType = (sourceNode?.config as FetchNodeConfig | undefined)
			?.objectType;
		// Nested loops are rejected, so a node belongs to at most one body.
		// A fetch-only source (line items) can't be a scope record — publish
		// validation rejects the loop; report no scope rather than a type
		// actions can't act on.
		if (sourceType && isFetchOnlyObjectType(sourceType)) {
			return { objectType: null, inLoop: true, loopNodeId: node.id };
		}
		return {
			objectType: sourceType ?? triggerObjectType,
			inLoop: true,
			loopNodeId: node.id,
		};
	}
	return { objectType: triggerObjectType, inLoop: false, loopNodeId: null };
}

/** Normalizes the `type` discriminant across the editor draft and backend trigger shapes. */
function effectiveTriggerType(
	trigger: TriggerConfig | AutomationTrigger
): string {
	const explicit = "type" in trigger ? trigger.type : undefined;
	return explicit ?? "status_changed";
}

/** Built-in globals, resolved on every run — shared by both variable-listing functions. */
const GLOBAL_VARIABLE_OPTIONS: VariableOption[] = [
	{ path: "workflow.now", label: "Current time", group: "Globals", fieldType: "datetime" },
	{ path: "org.id", label: "Organization ID", group: "Globals", fieldType: "text" },
	{ path: "org.name", label: "Organization name", group: "Globals", fieldType: "text" },
	{
		path: "user.id",
		label: "Your user ID (empty on scheduled runs)",
		group: "Globals",
		fieldType: "text",
	},
	{
		path: "user.name",
		label: "Your name (empty on scheduled runs)",
		group: "Globals",
		fieldType: "text",
	},
	{
		path: "user.email",
		label: "Your email (empty on scheduled runs)",
		group: "Globals",
		fieldType: "text",
	},
	{
		path: "run.automationName",
		label: "Automation name",
		group: "Globals",
		fieldType: "text",
	},
	{
		path: "run.automationId",
		label: "Automation ID",
		group: "Globals",
		fieldType: "text",
	},
	{
		path: "run.executionId",
		label: "Run ID (empty in test preview)",
		group: "Globals",
		fieldType: "text",
	},
	{
		path: "run.triggerType",
		label: "Trigger type",
		group: "Globals",
		fieldType: "text",
	},
];

/** " ID" suffix for id-type fields (e.g. "Client" -> "Client ID") disambiguates FK references. */
function fieldOptionLabel(
	prefix: string,
	field: { label: string; type: FieldType; isArray?: boolean }
): string {
	const suffix = field.type === "id" ? (field.isArray ? " IDs" : " ID") : "";
	return `${prefix} → ${field.label}${suffix}`;
}

/**
 * One-hop related-field options (C6): for every relation in
 * RELATED_OBJECTS[objectType], its filterable fields as
 * `<pathPrefix>.<relation>.<fieldKey>`. Grouped per relation ("Trigger ·
 * Client" / "Loop item · Client") so the picker's groups stay scannable
 * alongside the flat "Trigger"/"Loop item" group. Cap at one hop — never
 * recurse into RELATED_OBJECTS[relation].
 */
function relationVariableOptions(
	objectType: AutomationObjectType,
	pathPrefix: string,
	labelPrefix: string
): VariableOption[] {
	const options: VariableOption[] = [];
	for (const relation of RELATED_OBJECTS[objectType] ?? []) {
		const relationLabel = OBJECT_TYPE_LABELS[relation];
		for (const field of getFilterableFields(relation)) {
			options.push({
				path: `${pathPrefix}.${relation}.${field.key}`,
				label: fieldOptionLabel(`${labelPrefix} → ${relationLabel}`, field),
				group: `${labelPrefix} · ${relationLabel}`,
				fieldType: field.type,
				refType: field.refType,
				isArray: field.isArray,
				relation: { key: relation, label: relationLabel },
			});
		}
	}
	return options;
}

/**
 * A record's own `_id` option is refType-compatible with a destination `id`
 * field pointing at the same object type — but `task` and the line-item types
 * aren't valid `refType` values (no id field ever points at one), so those fall
 * back to undefined, same as any other unknown ref type: never flagged.
 */
function asRefType(
	objectType: AutomationObjectType
): FieldDefinition["refType"] {
	switch (objectType) {
		case "client":
		case "project":
		case "quote":
		case "invoice":
			return objectType;
		default:
			return undefined;
	}
}

/** trigger.record.<field> + trigger.event.oldValue/newValue — shared by both functions. */
function triggerVariableOptions(
	trigger: TriggerConfig | AutomationTrigger
): VariableOption[] {
	const options: VariableOption[] = [];
	// A scheduled trigger has no record, so it offers no trigger.record.* tokens.
	// This is the root site: every picker, the drawer's Variables pane, and the
	// formula reference pane all read from here.
	const triggerObjectType =
		effectiveTriggerType(trigger) === "scheduled"
			? undefined
			: ((trigger as { objectType?: AutomationObjectType }).objectType ??
				undefined);

	if (triggerObjectType) {
		// Runtime resolves _id by raw property lookup on the record; offer it explicitly.
		options.push({
			path: "trigger.record._id",
			label: `Trigger → ${OBJECT_TYPE_LABELS[triggerObjectType]} ID`,
			group: "Trigger",
			fieldType: "id",
			refType: asRefType(triggerObjectType),
		});
		for (const field of getFilterableFields(triggerObjectType)) {
			options.push({
				path: `trigger.record.${field.key}`,
				label: fieldOptionLabel("Trigger", field),
				group: "Trigger",
				fieldType: field.type,
				refType: field.refType,
				isArray: field.isArray,
			});
		}
		options.push(
			...relationVariableOptions(triggerObjectType, "trigger.record", "Trigger")
		);
	}

	if (effectiveTriggerType(trigger) === "status_changed") {
		options.push(
			{
				path: "trigger.event.oldValue",
				label: "Trigger → Previous status",
				group: "Trigger",
				fieldType: "select",
			},
			{
				path: "trigger.event.newValue",
				label: "Trigger → New status",
				group: "Trigger",
				fieldType: "select",
			}
		);
	}

	return options;
}

/**
 * Non-formula variable paths a formula (transitively) depends on. Returns null
 * on a parse error, a missing referenced formula, or a reference cycle — in
 * which case the formula is not offered anywhere.
 */
function formulaDependencyPaths(
	formula: FormulaResource,
	formulasById: Map<string, FormulaResource>,
	visiting: Set<string>
): Set<string> | null {
	if (visiting.has(formula.id)) return null; // cycle
	visiting.add(formula.id);

	let referenced: string[];
	try {
		referenced = collectReferencedPaths(parseFormula(formula.expression));
	} catch {
		return null;
	}

	const paths = new Set<string>();
	for (const p of referenced) {
		if (p.startsWith("formula.")) {
			const dep = formulasById.get(p.slice("formula.".length));
			if (!dep) return null;
			const depPaths = formulaDependencyPaths(dep, formulasById, visiting);
			if (!depPaths) return null;
			for (const dp of depPaths) paths.add(dp);
		} else {
			paths.add(p);
		}
	}

	visiting.delete(formula.id);
	return paths;
}

export function getAvailableVariables(
	nodes: WorkflowNode[],
	trigger: TriggerConfig | AutomationTrigger,
	targetNodeId: string,
	formulas?: FormulaResource[]
): VariableOption[] {
	// 1 + 2. trigger.record.<field>, trigger.event.oldValue/newValue.
	const options: VariableOption[] = triggerVariableOptions(trigger);

	const byId = new Map(nodes.map((n) => [n.id, n]));

	// 3. node.<fetchNodeId>.count — for every fetch_records node upstream of target.
	for (const node of nodes) {
		if (node.type !== "fetch_records") continue;
		if (!isReachableFrom(node.id, targetNodeId, byId)) continue;
		const config = node.config as FetchNodeConfig | undefined;
		const objectLabel = config?.objectType
			? OBJECT_TYPE_LABELS[config.objectType]
			: "records";
		options.push({
			path: `node.${node.id}.count`,
			label: `Found records (${objectLabel}) → Count`,
			group: "Found records",
			fieldType: "number",
		});
	}

	// 3b. node.<computeNodeId>.result — aggregate/adjust_time nodes upstream of target.
	for (const node of nodes) {
		if (node.type !== "aggregate" && node.type !== "adjust_time") continue;
		if (!isReachableFrom(node.id, targetNodeId, byId)) continue;
		options.push({
			path: `node.${node.id}.result`,
			label:
				node.type === "aggregate"
					? "Aggregate result"
					: "Adjusted time result",
			group: "Computed",
			fieldType: node.type === "aggregate" ? "number" : "datetime",
		});
	}

	// 4. loop.<loopNodeId>.item.<field> / .index — only inside that loop's body.
	for (const node of nodes) {
		if (node.type !== "loop") continue;
		if (node.id === targetNodeId) continue;
		const config = node.config as LoopNodeConfig | undefined;
		if (!config?.sourceNodeId) continue;

		const body = collectLoopBody(node.id, nodes);
		if (!body.has(targetNodeId)) continue;

		const sourceNode = byId.get(config.sourceNodeId);
		const sourceObjectType = (sourceNode?.config as FetchNodeConfig | undefined)
			?.objectType;
		// A fetch-only source (line items) can't drive a loop — publish rejects
		// it, so don't offer item variables that could never resolve.
		if (!sourceObjectType || isFetchOnlyObjectType(sourceObjectType)) continue;

		// Runtime resolves _id by raw property lookup on the loop item; offer it explicitly.
		options.push({
			path: `loop.${node.id}.item._id`,
			label: `Loop item → ${OBJECT_TYPE_LABELS[sourceObjectType]} ID`,
			group: "Loop item",
			fieldType: "id",
			refType: asRefType(sourceObjectType),
		});
		for (const field of getFilterableFields(sourceObjectType)) {
			options.push({
				path: `loop.${node.id}.item.${field.key}`,
				label: fieldOptionLabel("Loop item", field),
				group: "Loop item",
				fieldType: field.type,
				refType: field.refType,
				isArray: field.isArray,
			});
		}
		options.push(
			...relationVariableOptions(
				sourceObjectType,
				`loop.${node.id}.item`,
				"Loop item"
			)
		);
		options.push({
			path: `loop.${node.id}.index`,
			label: "Loop item → Index (0-based)",
			group: "Loop item",
			fieldType: "number",
		});
		options.push({
			path: `loop.${node.id}.position`,
			label: "Loop item → Position (1-based)",
			group: "Loop item",
			fieldType: "number",
		});
		options.push({
			path: `loop.${node.id}.count`,
			label: "Loop → Total item count",
			group: "Loop item",
			fieldType: "number",
		});
	}

	// 5. Built-in globals — resolved on every run (user.* is empty on scheduled
	// runs, but still offered). No graph dependency.
	options.push(...GLOBAL_VARIABLE_OPTIONS);

	// 6. formula.<id> — offered only where every path the formula (transitively)
	// references is in scope at this node. Authors define formulas against the
	// union of all variables; this enforces scope at the reference site.
	if (formulas && formulas.length > 0) {
		const availablePaths = new Set(options.map((o) => o.path));
		const formulasById = new Map(formulas.map((f) => [f.id, f]));
		for (const formula of formulas) {
			const deps = formulaDependencyPaths(formula, formulasById, new Set());
			if (!deps) continue;
			if (![...deps].every((p) => availablePaths.has(p))) continue;
			options.push({
				path: `formula.${formula.id}`,
				label: formula.name,
				group: "Formulas",
				fieldType: formula.returnType as FieldType,
			});
		}
	}

	return options;
}

/** A relation drill-down page: its group id, nav label ("Trigger → Client"), and fields. */
export type VariableRelationPage = {
	/** The option `group` this page collects (also the drill-down page id). */
	id: string;
	/** Nav-row + back-header label, e.g. "Trigger → Client". */
	navLabel: string;
	options: VariableOption[];
};

/**
 * Splits variable options into the drill-down root (non-relation groups, in
 * insertion order) and one navigable page per relation group. Pure, so the
 * picker's page structure is testable without a DOM. Nav label derives from the
 * group ("Trigger · Client") + the relation's own label.
 */
export function partitionVariableGroups(options: VariableOption[]): {
	rootGroups: [string, VariableOption[]][];
	relationPages: VariableRelationPage[];
} {
	const rootMap = new Map<string, VariableOption[]>();
	const relMap = new Map<string, VariableRelationPage>();
	for (const option of options) {
		if (option.relation) {
			let page = relMap.get(option.group);
			if (!page) {
				const prefix = option.group.split(" · ")[0];
				page = {
					id: option.group,
					navLabel: `${prefix} → ${option.relation.label}`,
					options: [],
				};
				relMap.set(option.group, page);
			}
			page.options.push(option);
		} else {
			const list = rootMap.get(option.group) ?? [];
			list.push(option);
			rootMap.set(option.group, list);
		}
	}
	return {
		rootGroups: Array.from(rootMap.entries()),
		relationPages: Array.from(relMap.values()),
	};
}

/**
 * The union of every variable a formula could ever reference, ignoring graph
 * position (no reachability/scope filter). Used by the formula editor's
 * reference pane: authors write against the full catalog, and
 * getAvailableVariables enforces scope wherever the resulting formula.<id> is
 * actually used.
 */
export function getAllVariableOptions(
	nodes: WorkflowNode[],
	trigger: TriggerConfig | AutomationTrigger,
	formulas?: FormulaResource[]
): VariableOption[] {
	const options: VariableOption[] = triggerVariableOptions(trigger);

	// Every fetch node's count, regardless of position.
	for (const node of nodes) {
		if (node.type !== "fetch_records") continue;
		const config = node.config as FetchNodeConfig | undefined;
		const objectLabel = config?.objectType
			? OBJECT_TYPE_LABELS[config.objectType]
			: "records";
		options.push({
			path: `node.${node.id}.count`,
			label: `Found records (${objectLabel}) → Count`,
			group: "Found records",
			fieldType: "number",
		});
	}

	// Every aggregate/adjust_time node's result, regardless of position.
	for (const node of nodes) {
		if (node.type !== "aggregate" && node.type !== "adjust_time") continue;
		options.push({
			path: `node.${node.id}.result`,
			label:
				node.type === "aggregate"
					? "Aggregate result"
					: "Adjusted time result",
			group: "Computed",
			fieldType: node.type === "aggregate" ? "number" : "datetime",
		});
	}

	// Every loop's item fields + index, regardless of position.
	for (const node of nodes) {
		if (node.type !== "loop") continue;
		const config = node.config as LoopNodeConfig | undefined;
		if (!config?.sourceNodeId) continue;
		const sourceNode = nodes.find((n) => n.id === config.sourceNodeId);
		const sourceObjectType = (sourceNode?.config as FetchNodeConfig | undefined)
			?.objectType;
		// A fetch-only source (line items) can't drive a loop — publish rejects
		// it, so don't offer item variables that could never resolve.
		if (!sourceObjectType || isFetchOnlyObjectType(sourceObjectType)) continue;

		options.push({
			path: `loop.${node.id}.item._id`,
			label: `Loop item → ${OBJECT_TYPE_LABELS[sourceObjectType]} ID`,
			group: "Loop item",
			fieldType: "id",
			refType: asRefType(sourceObjectType),
		});
		for (const field of getFilterableFields(sourceObjectType)) {
			options.push({
				path: `loop.${node.id}.item.${field.key}`,
				label: fieldOptionLabel("Loop item", field),
				group: "Loop item",
				fieldType: field.type,
				refType: field.refType,
				isArray: field.isArray,
			});
		}
		options.push(
			...relationVariableOptions(
				sourceObjectType,
				`loop.${node.id}.item`,
				"Loop item"
			)
		);
		options.push({
			path: `loop.${node.id}.index`,
			label: "Loop item → Index (0-based)",
			group: "Loop item",
			fieldType: "number",
		});
		options.push({
			path: `loop.${node.id}.position`,
			label: "Loop item → Position (1-based)",
			group: "Loop item",
			fieldType: "number",
		});
		options.push({
			path: `loop.${node.id}.count`,
			label: "Loop → Total item count",
			group: "Loop item",
			fieldType: "number",
		});
	}

	options.push(...GLOBAL_VARIABLE_OPTIONS);

	// formula.<id> — every formula, unfiltered (this catalog has no scope to check).
	if (formulas) {
		for (const formula of formulas) {
			options.push({
				path: `formula.${formula.id}`,
				label: formula.name,
				group: "Formulas",
				fieldType: formula.returnType as FieldType,
			});
		}
	}

	return options;
}
