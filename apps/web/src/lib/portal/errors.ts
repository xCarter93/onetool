import { ConvexError } from "convex/values";

// Portal helpers throw `new ConvexError({ code: "UNAUTHENTICATED" })` when the
// session is missing/expired/revoked. Other errors (transient server failures,
// rate limits, infrastructure) must surface to Next.js error.tsx — bouncing
// them to /verify would loop after re-auth.
export function isPortalAuthError(err: unknown): boolean {
	if (!(err instanceof ConvexError)) return false;
	const data = (err as ConvexError<{ code?: string }>).data;
	return data?.code === "UNAUTHENTICATED";
}
