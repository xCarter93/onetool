import { createContext, useContext } from "react";

export const PartitionContext = createContext<string | null>(null);

export function useOfflinePartition(): string | null {
	return useContext(PartitionContext);
}
