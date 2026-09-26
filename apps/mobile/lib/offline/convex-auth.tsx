import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useAuth } from "@clerk/expo";
import { ConvexProviderWithAuth, type ConvexReactClient } from "convex/react";
import NetInfo from "@react-native-community/netinfo";

const MAX_ONLINE_FAILURES = 5;

async function isReachable(): Promise<boolean> {
	const state = await NetInfo.fetch();
	return (state.isInternetReachable ?? state.isConnected) !== false;
}

function waitForReachableOrTimeout(ms: number): Promise<void> {
	return new Promise((resolve) => {
		const timer = setTimeout(done, ms);
		const unsubscribe = NetInfo.addEventListener((state) => {
			if ((state.isInternetReachable ?? state.isConnected) !== false) done();
		});
		function done() {
			clearTimeout(timer);
			unsubscribe();
			resolve();
		}
	});
}

// Mirrors convex/react-clerk's hook, except the token fetch waits out offline
// periods instead of returning null. A null token makes Convex drop to
// unauthenticated and never retry, so every query would throw once signal
// returned; waiting keeps the socket paused until a real token exists.
function useAuthFromClerkOffline() {
	const { isLoaded, isSignedIn, getToken, orgId, orgRole, sessionClaims } = useAuth();
	const getTokenRef = useRef(getToken);
	const audRef = useRef(sessionClaims?.aud);
	useEffect(() => {
		getTokenRef.current = getToken;
		audRef.current = sessionClaims?.aud;
	});

	const fetchAccessToken = useCallback(
		async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
			let onlineFailures = 0;
			for (let attempt = 0; ; attempt++) {
				if (await isReachable()) {
					try {
						return await getTokenRef.current(
							audRef.current === "convex"
								? { skipCache: forceRefreshToken }
								: { template: "convex", skipCache: forceRefreshToken },
						);
					} catch {
						onlineFailures++;
						if (onlineFailures >= MAX_ONLINE_FAILURES) return null;
					}
				}
				await waitForReachableOrTimeout(Math.min(2000 * 2 ** attempt, 30_000));
			}
		},
		// A new function identity makes Convex re-run setAuth, as in the upstream hook.
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[orgId, orgRole],
	);

	return useMemo(
		() => ({ isLoading: !isLoaded, isAuthenticated: isSignedIn ?? false, fetchAccessToken }),
		[isLoaded, isSignedIn, fetchAccessToken],
	);
}

export function ConvexClerkOfflineProvider({
	client,
	children,
}: {
	client: ConvexReactClient;
	children: ReactNode;
}) {
	return (
		<ConvexProviderWithAuth client={client} useAuth={useAuthFromClerkOffline}>
			{children}
		</ConvexProviderWithAuth>
	);
}
