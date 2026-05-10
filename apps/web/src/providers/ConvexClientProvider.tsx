"use client";

import { ReactNode } from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/nextjs";
import { env } from "@/env";

const convex = new ConvexReactClient(env.NEXT_PUBLIC_CONVEX_URL);

export default function ConvexClientProvider({
	children,
}: {
	children: ReactNode;
}) {
	// Render children directly. Previously this wrapped them in <Authenticated>{children}</Authenticated>
	// and <Unauthenticated>{children}</Unauthenticated>. Neither branch matches during the brief
	// AuthLoading transition that fires when Clerk's setActive() rotates the session (e.g., right
	// after createOrganization), so the workspace subtree was unmounting and resetting all client
	// state — visually indistinguishable from a page reload. Both branches rendered the same
	// children, so the swap served no purpose.
	return (
		<ConvexProviderWithClerk client={convex} useAuth={useAuth}>
			{children}
		</ConvexProviderWithClerk>
	);
}

export { convex };
