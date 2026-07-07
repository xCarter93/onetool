"use client";

import * as React from "react";

export interface SettingsSaveHandle {
	dirty: boolean;
	saving: boolean;
	/** When false the Save button stays disabled even while dirty (validation). */
	canSave: boolean;
	/** Must be stable (useCallback) — the register effect keys off its identity. */
	save: () => void;
	/** Must be stable (useCallback). Reverts the form to the last saved state. */
	discard: () => void;
	saveLabel?: string;
}

interface ContextValue {
	handle: SettingsSaveHandle | null;
	register: (handle: SettingsSaveHandle | null) => void;
}

const SettingsSaveContext = React.createContext<ContextValue | null>(null);

export function SettingsSaveProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [handle, setHandle] = React.useState<SettingsSaveHandle | null>(null);
	const register = React.useCallback(
		(next: SettingsSaveHandle | null) => setHandle(next),
		[],
	);
	const value = React.useMemo(
		() => ({ handle, register }),
		[handle, register],
	);
	return (
		<SettingsSaveContext.Provider value={value}>
			{children}
		</SettingsSaveContext.Provider>
	);
}

/** Read the active tab's save state — consumed by the container footer. */
export function useSettingsSaveFooter(): SettingsSaveHandle | null {
	return React.useContext(SettingsSaveContext)?.handle ?? null;
}

/**
 * A tab surfaces its Save/Discard/dirty state to the container's unified footer.
 * `save` and `discard` MUST be stable (useCallback) or this re-registers every
 * render. The registration clears automatically when the tab unmounts.
 */
export function useRegisterSettingsSave(handle: SettingsSaveHandle): void {
	const register = React.useContext(SettingsSaveContext)?.register;
	const { dirty, saving, canSave, save, discard, saveLabel } = handle;
	React.useEffect(() => {
		if (!register) return;
		register({ dirty, saving, canSave, save, discard, saveLabel });
		return () => register(null);
	}, [register, dirty, saving, canSave, save, discard, saveLabel]);
}
