export type RecordKind = "task" | "project" | "client" | "quote" | "invoice";
export type RecordRef = { kind: RecordKind; id: string };

export type WorkingSetInput = {
	calendar: {
		tasks: { id: string; clientId?: string; projectId?: string }[];
		projects: { id: string; clientId?: string }[];
	} | null;
	sentQuotes: { _id: string; clientId?: string }[];
	overdueInvoices: { _id: string }[];
	recents: { kind: string; id: string }[];
};

export const WORKING_SET_LIMIT = 60;

const KINDS = new Set<string>(["task", "project", "client", "quote", "invoice"]);

/** The day's records first, then what they link to, then recents; deduped and capped. */
export function selectWorkingSet(input: WorkingSetInput, limit = WORKING_SET_LIMIT): RecordRef[] {
	const refs: RecordRef[] = [];
	const seen = new Set<string>();
	const add = (kind: RecordKind, id: string | undefined) => {
		if (!id || refs.length >= limit) return;
		const key = `${kind}:${id}`;
		if (seen.has(key)) return;
		seen.add(key);
		refs.push({ kind, id });
	};

	const tasks = input.calendar?.tasks ?? [];
	const projects = input.calendar?.projects ?? [];
	for (const task of tasks) add("task", task.id);
	for (const project of projects) add("project", project.id);
	for (const task of tasks) add("project", task.projectId);
	for (const project of projects) add("client", project.clientId);
	for (const task of tasks) add("client", task.clientId);
	for (const quote of input.sentQuotes) add("quote", quote._id);
	for (const invoice of input.overdueInvoices) add("invoice", invoice._id);
	for (const recent of input.recents) {
		if (KINDS.has(recent.kind)) add(recent.kind as RecordKind, recent.id);
	}
	return refs;
}
