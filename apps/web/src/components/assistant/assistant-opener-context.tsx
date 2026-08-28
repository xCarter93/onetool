"use client";

import { createContext, useContext } from "react";

/**
 * Lets workspace surfaces open the assistant panel.
 * Provided by AssistantSurfaceProvider, which owns the
 * panel's open state; null outside that tree so consumers can hide their
 * affordance.
 */
export const AssistantOpenerContext = createContext<(() => void) | null>(null);

export function useAssistantOpener(): (() => void) | null {
	return useContext(AssistantOpenerContext);
}
