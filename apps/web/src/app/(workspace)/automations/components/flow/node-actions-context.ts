import { createContext, useContext } from "react";

export interface NodeActions {
	onDuplicate?: (nodeId: string) => void;
	onDelete?: (nodeId: string) => void;
}

/** Step-menu callbacks, provided once by the canvas so node cards stay prop-free. */
export const NodeActionsContext = createContext<NodeActions>({});

export function useNodeActions(): NodeActions {
	return useContext(NodeActionsContext);
}
