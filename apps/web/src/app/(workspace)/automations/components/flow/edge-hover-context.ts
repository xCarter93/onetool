"use client";

import { createContext, useContext } from "react";

/**
 * Id of the edge currently under the pointer (via React Flow's
 * onEdgeMouseEnter/Leave on the widened interaction path). Edge components
 * read it so hovering anywhere along an edge emphasizes the stroke and its
 * insert "+" together.
 */
export const HoveredEdgeContext = createContext<string | null>(null);

export function useEdgeHovered(edgeId: string): boolean {
	return useContext(HoveredEdgeContext) === edgeId;
}
