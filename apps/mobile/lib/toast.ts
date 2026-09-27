import { useSyncExternalStore } from "react";

export interface Toast {
	id: number;
	message: string;
}

let current: Toast | null = null;
let nextId = 1;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function emit() {
	for (const l of listeners) l();
}

/** Brief confirmation after an action that doesn't navigate (e.g. a new task). */
export function showToast(message: string, durationMs = 2600) {
	current = { id: nextId++, message };
	emit();
	clearTimeout(timer);
	timer = setTimeout(() => {
		current = null;
		emit();
	}, durationMs);
}

export function useToast(): Toast | null {
	return useSyncExternalStore(
		(l) => {
			listeners.add(l);
			return () => {
				listeners.delete(l);
			};
		},
		() => current,
	);
}
