import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import {
	getFunctionName,
	type FunctionArgs,
	type FunctionReference,
	type FunctionReturnType,
} from "convex/server";
import type { ConvexReactClient } from "convex/react";
import { readCache, writeCache } from "./db";
import { useOfflinePartition } from "./partition-context";

// Cached reads older than this are hidden: a disconnected device can't learn it
// lost access, so stale access is time-boxed (PRD §4.5).
export const MAX_OFFLINE_READ_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function canonical(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonical);
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.keys(value as Record<string, unknown>)
				.sort()
				.map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
		);
	}
	return value;
}

export function cacheKey(query: FunctionReference<"query">, args: unknown): string {
	return `${getFunctionName(query)}:${JSON.stringify(canonical(args ?? {}))}`;
}

// Mounted reads currently served from the cache, for the "Updated 2h ago" marker.
const staleReads = new Map<symbol, number>();
const staleListeners = new Set<() => void>();
let oldestStale: number | null = null;

function recomputeStale() {
	const next = staleReads.size === 0 ? null : Math.min(...staleReads.values());
	if (next === oldestStale) return;
	oldestStale = next;
	for (const listener of staleListeners) listener();
}

/** Oldest fetch time among on-screen data that came from the cache, or null. */
export function useOldestCachedRead(): number | null {
	return useSyncExternalStore(
		(listener) => {
			staleListeners.add(listener);
			return () => staleListeners.delete(listener);
		},
		() => oldestStale,
	);
}

function readFreshCache(partition: string, key: string) {
	const entry = readCache(partition, key);
	if (!entry || Date.now() - entry.fetchedAt > MAX_OFFLINE_READ_AGE_MS) return null;
	return entry;
}

export function useCachedQuery<Query extends FunctionReference<"query">>(
	query: Query,
	args: FunctionArgs<Query> | "skip",
): FunctionReturnType<Query> | undefined {
	const partition = useOfflinePartition();
	const { isAuthenticated } = useConvexAuth();
	// Unauthenticated queries throw in render; wait for auth and serve the cache.
	const live = useQuery(query, ...([isAuthenticated ? args : "skip"] as [FunctionArgs<Query> | "skip"]));
	const key = args === "skip" ? null : cacheKey(query, args);

	const cached = useMemo(
		() => (partition && key ? readFreshCache(partition, key) : null),
		[partition, key],
	);

	useEffect(() => {
		if (live === undefined || !partition || !key) return;
		const timer = setTimeout(() => void writeCache(partition, key, live, Date.now()), 500);
		return () => clearTimeout(timer);
	}, [live, partition, key]);

	const [token] = useState(() => Symbol("cached-read"));
	const servingCache = live === undefined && cached !== null;
	useEffect(() => {
		if (servingCache && cached) staleReads.set(token, cached.fetchedAt);
		else staleReads.delete(token);
		recomputeStale();
		return () => {
			staleReads.delete(token);
			recomputeStale();
		};
	}, [servingCache, cached, token]);

	if (live !== undefined) return live;
	return (cached?.value as FunctionReturnType<Query> | undefined) ?? undefined;
}

/** Fetches once and stores under the same key `useCachedQuery` reads. */
export async function prefetchQuery<Query extends FunctionReference<"query">>(
	client: ConvexReactClient,
	partition: string,
	query: Query,
	args: FunctionArgs<Query>,
): Promise<FunctionReturnType<Query>> {
	const value = await client.query(query, args);
	await writeCache(partition, cacheKey(query, args), value, Date.now());
	return value;
}
