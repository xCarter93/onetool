"use client";

import { useEffect, useState } from "react";

type Sheet = { code: string; title: string };

/**
 * The live title block: a one-row sheet stamp pinned inside the fixed site
 * frame that names whichever sheet is crossing the middle of the viewport.
 *
 * Decorative duplication — every sheet code it shows is already real DOM text
 * inside its own section — so the whole block is aria-hidden. It is hidden
 * below 850px, the same breakpoint at which `.site-frame` appears; without the
 * frame band there is nothing for it to sit on.
 */
export function SheetIndicator() {
	const [sheet, setSheet] = useState<Sheet | null>(null);

	useEffect(() => {
		const sheets = Array.from(
			document.querySelectorAll<HTMLElement>("[data-sheet]"),
		);
		if (sheets.length === 0) return;

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;
					const el = entry.target as HTMLElement;
					const code = el.dataset.sheet;
					const title = el.dataset.sheetTitle;
					if (!code || !title) continue;
					setSheet((prev) =>
						prev?.code === code ? prev : { code, title },
					);
				}
			},
			// A mid-viewport band: the sheet under the reader's eye wins.
			{ rootMargin: "-45% 0px -45% 0px" },
		);

		for (const el of sheets) observer.observe(el);
		return () => observer.disconnect();
	}, []);

	if (!sheet) return null;

	return (
		<div
			aria-hidden="true"
			className="pointer-events-none fixed bottom-2.5 right-16 z-[9999] hidden divide-x divide-bp-line border border-bp-line bg-bp-paper min-[850px]:flex"
		>
			<div className="px-3 py-1.5 text-[10px] font-semibold uppercase leading-none tracking-[0.14em] text-muted-foreground">
				Sheet
			</div>
			<div className="px-3 py-1.5 text-[11px] font-medium leading-none tabular-nums text-foreground">
				{/* Keyed so a sheet change remounts the value and re-runs the fade. */}
				<span
					key={sheet.code}
					className="animate-in fade-in duration-200 motion-reduce:animate-none"
				>
					{sheet.code} · {sheet.title.toUpperCase()}
				</span>
			</div>
		</div>
	);
}
