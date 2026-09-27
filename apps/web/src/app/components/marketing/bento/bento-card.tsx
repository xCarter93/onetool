import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import type { BentoCopy } from "./copy";

/** Shell for every landing bento cell: animated stage on top, linked title and body below. */
export function BentoCard({ title, body, href, children }: BentoCopy & { children?: ReactNode }) {
	return (
		<article className="group relative flex h-full min-h-[380px] w-full flex-col overflow-hidden rounded-[16px] border border-(--rule-2) bg-(--sheet)">
			<div className="@container relative min-h-[220px] flex-1 overflow-hidden">{children}</div>
			<div className="px-6 pb-6 pt-2">
				<h3 className="text-[16px] font-semibold leading-6 tracking-[-0.01em] text-(--ink)">
					<Link
						href={href as Route}
						className="group/link inline-flex items-baseline gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink) focus-visible:ring-offset-2 focus-visible:ring-offset-(--sheet)"
					>
						{title}
						<span
							aria-hidden="true"
							className="text-(--ink-3) transition-[color,translate] duration-200 ease-out group-hover/link:translate-x-0.5 group-hover/link:text-(--accent-ink) motion-reduce:transition-none"
						>
							→
						</span>
					</Link>
				</h3>
				<p className="mt-1.5 text-[14px] leading-[1.55] text-pretty text-(--ink-2)">{body}</p>
			</div>
		</article>
	);
}
