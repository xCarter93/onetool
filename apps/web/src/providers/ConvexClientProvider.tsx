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
	// Render children unconditionally — gating on Authenticated/AuthLoading/
	// Unauthenticated remounts the workspace subtree on every auth transition
	// (e.g. setActive during org switch), causing two flashes. useQuery already
	// returns undefined while auth is in flight, and middleware blocks
	// unauthenticated access to workspace routes.
	return (
		<ConvexProviderWithClerk client={convex} useAuth={useAuth}>
			{children}
		</ConvexProviderWithClerk>
	);
}

export { convex };
