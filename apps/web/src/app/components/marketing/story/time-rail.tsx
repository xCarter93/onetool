import type { Ref } from "react";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import { CHAPTER_OFFSET, CHAPTERS } from "./chapters";

export function TimeRail({ ref, active, onJump }: {
	ref: Ref<HTMLDivElement>;
	active: number;
	onJump: (scene: number, instant?: boolean) => void;
}) {
	return (
		<div ref={ref} className="lp-story-rail">
			<div className="lp-story-rail-inner">
				<div className="lp-story-rail-meta">
					<p>{active < 0 ? "One connected workday" : `${String(active + 1).padStart(2, "0")} / 10`}<span>Illustrative workspace</span></p>
					<a href="#phone">Explore the rest <ArrowDown size={13} aria-hidden="true" /></a>
				</div>
				<nav aria-label="Workday chapters" className="lp-story-chapters">
					{CHAPTERS.map((chapter, index) => (
						<button key={chapter.key} type="button" aria-label={`${chapter.railTime}, ${chapter.railLabel}`} aria-current={active === index ? "step" : undefined} data-complete={active > index || undefined} onClick={event => onJump(index + CHAPTER_OFFSET, event.detail === 0)}>
							<span className="lp-story-chapter-track"><span /></span>
							<span className="lp-story-chapter-time">{chapter.railTime}</span>
							<span className="lp-story-chapter-label">{chapter.railLabel}<ArrowUpRight size={12} aria-hidden="true" /></span>
						</button>
					))}
				</nav>
			</div>
		</div>
	);
}
