"use client";

import { AlertCircle, ArrowUpRight } from "lucide-react";
import type { ToolRendererProps } from "./index";

interface NavigateOutput {
	ok: boolean;
	path: string;
	reason?: string;
}

// The actual router.push happens in the sheet (useNavigateToolEffect) —
// this only shows what happened in the transcript.
export function NavigateRenderer({ output }: ToolRendererProps) {
	const result = output as NavigateOutput;
	if (typeof result?.path !== "string") return null;
	return (
		<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
			{result.ok ? (
				<>
					<ArrowUpRight className="size-3" />
					Opened <code className="text-foreground/80">{result.path}</code>
				</>
			) : (
				<>
					<AlertCircle className="size-3" />
					Couldn&apos;t open <code>{result.path}</code>
				</>
			)}
		</div>
	);
}
