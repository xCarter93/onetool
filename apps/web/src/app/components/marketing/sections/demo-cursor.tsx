import type { Ref } from "react";

const SIZE = 26;
const ENTER = "cubic-bezier(0.22, 1, 0.36, 1)";
// Fitted to traces of the former motion springs (arrow tight, label trailing) on the 700ms ease-out glide.
const ARROW_TRANSITION = `translate 540ms cubic-bezier(0.3, 0.4, 0.2, 1) 10ms, opacity 180ms ${ENTER}, scale 180ms ${ENTER}`;
const LABEL_TRANSITION = `translate 580ms cubic-bezier(0.4, 0.4, 0.28, 1) 30ms, opacity 220ms ${ENTER}, scale 220ms ${ENTER}`;

type DemoCursorProps = {
	ref?: Ref<HTMLDivElement>;
	at: { x: number; y: number };
	name: string;
	color: string;
	textColor: string;
};

/** The scripted collaborator cursor; glides on `at` changes via CSS transitions. */
export function DemoCursor({ ref, at, name, color, textColor }: DemoCursorProps) {
	const translate = `${at.x}px ${at.y}px`;
	return (
		<div ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 z-20">
			<div
				className="absolute left-0 top-0 -rotate-14 select-none will-change-transform starting:scale-60 starting:opacity-0"
				style={{ translate, transition: ARROW_TRANSITION }}
			>
				{/* Inline svg in a block: its baseline gap sets the rotation centre TIP was measured against. */}
				<div className="block">
					<svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none">
						<path
							d="M5.2 3.4c-.7-.3-1.5.4-1.2 1.1l5.7 14.8c.3.8 1.5.8 1.8 0l2.4-6 6-2.4c.8-.3.8-1.5 0-1.8L5.2 3.4Z"
							// var() isn't resolved in the fill presentation attribute.
							style={{ fill: color }}
							stroke="rgba(0,0,0,0.18)"
							strokeWidth={1.2}
							strokeLinejoin="round"
						/>
					</svg>
				</div>
			</div>
			<div
				className="absolute left-0 top-0 select-none will-change-transform starting:scale-70 starting:opacity-0"
				style={{ translate, transition: LABEL_TRANSITION }}
			>
				<div
					className="inline-flex items-center rounded-full font-medium leading-none shadow-[0_2px_10px_rgba(0,0,0,0.15)]"
					style={{
						background: color,
						color: textColor,
						fontSize: SIZE * 0.5,
						paddingInline: SIZE * 0.43,
						paddingBlock: SIZE * 0.18,
						transform: `translate(${SIZE * 0.9}px, ${SIZE * 0.2 + 6}px)`,
					}}
				>
					{name}
				</div>
			</div>
		</div>
	);
}
