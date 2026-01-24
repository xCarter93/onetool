"use client";

import React from "react";
import { cn } from "@/lib/utils";
import Dot from "./dot-background";

interface WorkflowCanvasProps {
	children: React.ReactNode;
	className?: string;
}

export function WorkflowCanvas({ children, className }: WorkflowCanvasProps) {
	return (
		<Dot
			color="rgba(150, 150, 150, 0.35)"
			size={1.5}
			spacing={15}
			className={cn(
				"relative min-h-[600px] rounded-xl border border-border/50 overflow-hidden bg-background dark:bg-background",
				className
			)}
			style={{
				backgroundColor: "transparent",
			}}
		>
			{/* Content */}
			<div className="relative z-10 flex flex-col items-center py-12 px-4">
				{children}
			</div>
		</Dot>
	);
}

