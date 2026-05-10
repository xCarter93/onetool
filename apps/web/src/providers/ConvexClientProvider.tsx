"use client";

import { ReactNode } from "react";
import {
	Authenticated,
	AuthLoading,
	ConvexReactClient,
	Unauthenticated,
} from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/nextjs";
import { env } from "@/env";

const convex = new ConvexReactClient(env.NEXT_PUBLIC_CONVEX_URL);

export default function ConvexClientProvider({
	children,
}: {
	children: ReactNode;
}) {
	// AuthLoading branch keeps the subtree mounted while Clerk rotates tokens
	// (e.g., during setActive); without it, neither Authenticated nor Unauthenticated
	// matched and the workspace tree unmounted mid-flow.
	return (
		<ConvexProviderWithClerk client={convex} useAuth={useAuth}>
			<Authenticated>{children}</Authenticated>
			<AuthLoading>{children}</AuthLoading>
			<Unauthenticated>{children}</Unauthenticated>
		</ConvexProviderWithClerk>
	);
}

export { convex };
