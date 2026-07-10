"use client";

import { createContext, useContext } from "react";

/**
 * Lets workspace surfaces (e.g. the report builder's "Ask AI" button) open
 * the assistant panel. Provided by SidebarWithHeader, which owns the panel's
 * open state; null outside that tree so consumers can hide their affordance.
 */
export const AssistantOpenerContext = createContext<(() => void) | null>(null);

export function useAssistantOpener(): (() => void) | null {
	return useContext(AssistantOpenerContext);
}
