"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CHAPTERS, type Chapter } from "../features";

/** The step list beside the chapters; `children` is one drawing per chapter, shown faintly behind the current one. */
export function ChapterIndex({ children }: { children?: ReactNode }) {
	const [active, setActive] = useState<Chapter>(CHAPTERS[0].id);

	useEffect(() => {
		const chapters = CHAPTERS.map(({ id }) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
		// A thin band at 40% of the viewport: whichever chapter crosses it is the current one.
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) setActive(entry.target.id as Chapter);
				}
			},
			{ rootMargin: "-40% 0px -56% 0px" },
		);
		chapters.forEach((chapter) => observer.observe(chapter));
		return () => observer.disconnect();
	}, []);

	return (
		<div className="lp-chapter-index">
			<nav aria-label="Steps in the tour">
				<ol>
					{CHAPTERS.map((chapter, index) => (
						<li key={chapter.id}>
							<a href={`#${chapter.id}`} aria-current={active === chapter.id ? "true" : undefined}>
								<span aria-hidden="true">{index + 1}</span>
								{chapter.label}
							</a>
						</li>
					))}
				</ol>
			</nav>
			<div className="lp-chapter-art" data-active={active} aria-hidden="true">
				{children}
			</div>
		</div>
	);
}
