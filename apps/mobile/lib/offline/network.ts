import { useNetInfo } from "@react-native-community/netinfo";

/** Reachability hint for UI copy; the sync loop trusts the Convex socket, not this. */
export function useIsOnline(): boolean {
	const { isConnected, isInternetReachable } = useNetInfo();
	return (isInternetReachable ?? isConnected) !== false;
}
