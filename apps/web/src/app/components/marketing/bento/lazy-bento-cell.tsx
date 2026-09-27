"use client";

import { useInView } from "motion/react";
import dynamic from "next/dynamic";
import { useRef, type ComponentType } from "react";
import { cn } from "@/lib/utils";
import { BentoCard } from "./bento-card";
import { BENTO_COPY, type BentoKey } from "./copy";

function placeholder(key: BentoKey) {
	function Placeholder() {
		return <BentoCard {...BENTO_COPY[key]} />;
	}
	return Placeholder;
}

const CELLS: Record<BentoKey, ComponentType> = {
	schedule: dynamic(() => import("./schedule-cell").then((m) => m.ScheduleCell), {
		ssr: false,
		loading: placeholder("schedule"),
	}),
	inbox: dynamic(() => import("./inbox-cell").then((m) => m.InboxCell), {
		ssr: false,
		loading: placeholder("inbox"),
	}),
	payments: dynamic(() => import("./payments-cell").then((m) => m.PaymentsCell), {
		ssr: false,
		loading: placeholder("payments"),
	}),
	automation: dynamic(() => import("./automation-cell").then((m) => m.AutomationCell), {
		ssr: false,
		loading: placeholder("automation"),
	}),
	assistant: dynamic(() => import("./assistant-cell").then((m) => m.AssistantCell), {
		ssr: false,
		loading: placeholder("assistant"),
	}),
	command: dynamic(() => import("./command-cell").then((m) => m.CommandCell), {
		ssr: false,
		loading: placeholder("command"),
	}),
	import: dynamic(() => import("./import-cell").then((m) => m.ImportCell), {
		ssr: false,
		loading: placeholder("import"),
	}),
	sync: dynamic(() => import("./sync-cell").then((m) => m.SyncCell), {
		ssr: false,
		loading: placeholder("sync"),
	}),
};

/** Server-renders the cell's copy, then fetches the animated cell when it nears the viewport. */
export function LazyBentoCell({ cell, className }: { cell: BentoKey; className?: string }) {
	const ref = useRef<HTMLDivElement>(null);
	const near = useInView(ref, { once: true, margin: "400px 0px" });
	const Cell = CELLS[cell];
	return (
		<div ref={ref} className={cn("h-full", className)}>
			{near ? <Cell /> : <BentoCard {...BENTO_COPY[cell]} />}
		</div>
	);
}
