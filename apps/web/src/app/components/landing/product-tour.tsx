"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { FeatureKey } from "@/remotion/compositions";

const FeatureAnimation = dynamic(
	() => import("./feature-animation").then((m) => m.FeatureAnimation),
	{
		ssr: false,
		loading: () => (
			<div className="aspect-8/5 w-full animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
		),
	},
);

const TABS: { key: FeatureKey; label: string }[] = [
	{ key: "showcase", label: "Full tour" },
	{ key: "clients", label: "Clients" },
	{ key: "quote-to-paid", label: "Quotes → Paid" },
	{ key: "tasks", label: "Tasks" },
	{ key: "routing", label: "Routing" },
	{ key: "automations", label: "Automations" },
	{ key: "assistant", label: "AI assistant" },
	{ key: "reports", label: "Reports" },
];

export default function ProductTour() {
	const [active, setActive] = useState<FeatureKey>("showcase");

	return (
		<section id="product-tour" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
			<div className="mb-8 text-center">
				<h2 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl dark:text-zinc-50">
					See OneTool in action
				</h2>
				<p className="mt-3 text-lg text-zinc-600 dark:text-zinc-400">
					Real workflows, from first quote to money in the bank.
				</p>
			</div>

			<div className="mb-6 flex flex-wrap justify-center gap-2">
				{TABS.map((tab) => (
					<button
						key={tab.key}
						type="button"
						onClick={() => setActive(tab.key)}
						className={`rounded-full border-2 px-4 py-1.5 text-sm font-semibold transition-colors ${
							active === tab.key
								? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
								: "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-300"
						}`}
					>
						{tab.label}
					</button>
				))}
			</div>

			<div className="overflow-hidden rounded-lg border-2 border-zinc-900 bg-white shadow-[6px_6px_0px_rgb(24,24,27)] dark:border-zinc-300 dark:bg-zinc-900 dark:shadow-[6px_6px_0px_rgb(161,161,170)]">
				<FeatureAnimation key={active} feature={active} controls={active === "showcase"} />
			</div>
		</section>
	);
}
