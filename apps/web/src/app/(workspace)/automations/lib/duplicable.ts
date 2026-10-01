const NOT_DUPLICABLE_TYPES = new Set(["placeholder", "condition", "loop", "end", "next_item"]);

export const NOT_DUPLICABLE_REASON = "Branching steps can't be duplicated yet";

export function isDuplicableStep(nodeType: string): boolean {
	return !NOT_DUPLICABLE_TYPES.has(nodeType);
}
