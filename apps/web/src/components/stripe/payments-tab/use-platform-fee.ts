"use client";

import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";

export type PlatformFee =
	| { status: "loading"; dollars: null }
	| { status: "ready"; dollars: number };

/** The configured OneTool per-charge fee, as the backend will actually apply it. */
export function usePlatformFee(): PlatformFee {
	const fee = useQuery(api.platformFee.get);
	return fee === undefined
		? { status: "loading", dollars: null }
		: { status: "ready", dollars: fee.platformFeeDollars };
}
