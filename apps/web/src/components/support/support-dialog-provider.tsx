"use client";

import * as React from "react";
import {
	SupportDialog,
	type SupportIntent,
} from "@/components/support/support-dialog";

const SupportDialogContext = React.createContext<
	((intent: SupportIntent) => void) | null
>(null);

/** Null outside the provider (e.g. the public help center) — callers fall back to mailto. */
export function useOptionalSupportDialog() {
	return React.useContext(SupportDialogContext);
}

export function useSupportDialog(): (intent: SupportIntent) => void {
	const ctx = React.useContext(SupportDialogContext);
	if (!ctx) {
		throw new Error(
			"useSupportDialog must be used within SupportDialogProvider"
		);
	}
	return ctx;
}

/**
 * Hosts the support composer so the HelpMenu and ⌘K palette can open it from
 * anywhere in the workspace. Same mount-on-demand + two-step unmount as
 * CreateRecordProvider: close plays the exit animation, then unmount.
 */
export function SupportDialogProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [intent, setIntent] = React.useState<SupportIntent | null>(null);
	const [open, setOpen] = React.useState(false);

	const openSupport = React.useCallback((next: SupportIntent) => {
		setIntent(next);
		setOpen(true);
	}, []);

	return (
		<SupportDialogContext.Provider value={openSupport}>
			{children}
			{intent && (
				<SupportDialog
					intent={intent}
					open={open}
					onOpenChange={(next) => {
						if (!next) setOpen(false);
					}}
					onOpenChangeComplete={(nowOpen) => {
						if (!nowOpen) setIntent(null);
					}}
				/>
			)}
		</SupportDialogContext.Provider>
	);
}
