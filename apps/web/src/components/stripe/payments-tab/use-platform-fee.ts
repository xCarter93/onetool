"use client";

import { useEffect, useState } from "react";

export type PlatformFee =
	| { status: "loading"; dollars: null }
	| { status: "error"; dollars: null }
	| { status: "ready"; dollars: number };

/** The configured OneTool per-charge fee, as the backend will actually apply it. */
export function usePlatformFee(): PlatformFee {
	const [fee, setFee] = useState<PlatformFee>({ status: "loading", dollars: null });

	useEffect(() => {
		let cancelled = false;
		fetch("/api/stripe-connect/platform-fee")
			.then(async (res) => {
				if (!res.ok) throw new Error(String(res.status));
				const data = (await res.json()) as { platformFeeDollars?: unknown };
				if (typeof data.platformFeeDollars !== "number") throw new Error("shape");
				if (!cancelled) setFee({ status: "ready", dollars: data.platformFeeDollars });
			})
			.catch(() => {
				if (!cancelled) setFee({ status: "error", dollars: null });
			});
		return () => {
			cancelled = true;
		};
	}, []);

	return fee;
}
