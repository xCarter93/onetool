import type { ConditionGroup, FormulaResource } from "./workflowTypes";
import { collectReferencedPaths, parseFormula } from "./formula";

/**
 * Static scan of an automation definition for one-hop relation references
 * (`trigger.record.client.companyName`, `loop.<id>.item.project.title`), so
 * the executor hydrates only the relations a run actually mentions —
 * definitions without relation paths pay zero extra reads.
 *
 * Names collected here are CANDIDATES: the first path segment after
 * `record.`/`item.` when one more segment follows. Validation against
 * RELATED_OBJECTS happens at hydration (where the record's type is known), so
 * flat field keys that happen to contain dots are simply skipped there.
 */
export type RelationRefs = {
	/** Relation candidates referenced off trigger.record.* */
	trigger: Set<string>;
	/** Relation candidates referenced off loop.<loopNodeId>.item.*, per loop. */
	loops: Map<string, Set<string>>;
};

const TEMPLATE_TOKEN = /\{\{\s*([^{}]+?)\s*\}\}/g;

/**
 * Collect every variable path a config value can carry: ValueRef `var` paths
 * and `{{...}}` tokens inside any string, walked generically so new config
 * shapes are covered without registration.
 */
function collectPathsFromValue(value: unknown, paths: Set<string>): void {
	if (typeof value === "string") {
		for (const match of value.matchAll(TEMPLATE_TOKEN)) paths.add(match[1]);
		return;
	}
	if (Array.isArray(value)) {
		for (const entry of value) collectPathsFromValue(entry, paths);
		return;
	}
	if (value && typeof value === "object") {
		const obj = value as Record<string, unknown>;
		if (obj.kind === "var" && typeof obj.path === "string") paths.add(obj.path);
		for (const entry of Object.values(obj)) collectPathsFromValue(entry, paths);
	}
}

function collectFormulaPaths(
	formulas: FormulaResource[] | undefined,
	paths: Set<string>
): void {
	for (const formula of formulas ?? []) {
		try {
			for (const path of collectReferencedPaths(parseFormula(formula.expression))) {
				paths.add(path);
			}
		} catch {
			// An unparseable formula never evaluates, so it references nothing.
		}
	}
}

function relationCandidate(fieldPath: string): string | undefined {
	const dot = fieldPath.indexOf(".");
	return dot > 0 ? fieldPath.slice(0, dot) : undefined;
}

// nodes/trigger are walked generically (any config shape), so they stay
// untyped here and the executor passes its own node/trigger types.
export function collectRelationRefs(
	nodes: unknown,
	trigger: unknown,
	formulas: FormulaResource[] | undefined
): RelationRefs {
	const paths = new Set<string>();
	collectPathsFromValue(nodes, paths);
	if (trigger) collectPathsFromValue(trigger, paths);
	collectFormulaPaths(formulas, paths);

	const refs: RelationRefs = { trigger: new Set(), loops: new Map() };
	const TRIGGER_RECORD = "trigger.record.";
	const LOOP = "loop.";
	const ITEM = "item.";
	for (const path of paths) {
		if (path.startsWith(TRIGGER_RECORD)) {
			const candidate = relationCandidate(path.slice(TRIGGER_RECORD.length));
			if (candidate) refs.trigger.add(candidate);
			continue;
		}
		if (!path.startsWith(LOOP)) continue;
		const rest = path.slice(LOOP.length);
		const dot = rest.indexOf(".");
		if (dot <= 0) continue;
		const loopNodeId = rest.slice(0, dot);
		const tail = rest.slice(dot + 1);
		if (!tail.startsWith(ITEM)) continue;
		const candidate = relationCandidate(tail.slice(ITEM.length));
		if (!candidate) continue;
		let set = refs.loops.get(loopNodeId);
		if (!set) refs.loops.set(loopNodeId, (set = new Set()));
		set.add(candidate);
	}
	return refs;
}

/**
 * Relation candidates from dotted `rule.field` keys ("client.companyName") in
 * condition groups. Dotted rule fields name relations of whatever record the
 * rules evaluate against, so callers hydrate these lazily at the eval site
 * where that record and its type are known.
 */
export function dottedRuleFieldCandidates(
	groups: ConditionGroup[]
): Set<string> {
	const out = new Set<string>();
	for (const group of groups) {
		for (const rule of group.rules) {
			const candidate = relationCandidate(rule.field);
			if (candidate) out.add(candidate);
		}
	}
	return out;
}
