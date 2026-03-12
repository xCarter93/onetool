"use client";

const CORNER_PATH =
	"M5.50871e-06 0C-0.00788227 37.3001 8.99616 50.0116 50 50H5.50871e-06V0Z";

function CornerSVG({ className }: { className: string }) {
	return (
		<svg
			className={className}
			width="50"
			height="50"
			viewBox="0 0 50 50"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			aria-hidden="true"
		>
			<path d={CORNER_PATH} fill="currentColor" />
		</svg>
	);
}

export default function PageFrame() {
	return (
		<>
			{/* Fixed frame borders */}
			<div className="site-frame site-frame-top" aria-hidden="true" />
			<div className="site-frame site-frame-bottom" aria-hidden="true" />
			<div className="site-frame site-frame-left" aria-hidden="true" />
			<div className="site-frame site-frame-right" aria-hidden="true" />

			{/* Corner decorations - 50x50 curved SVGs with rotations */}
			<CornerSVG className="fixed z-[9998] pointer-events-none text-frame top-2.5 left-2.5 rotate-90 hidden min-[850px]:block" />
			<CornerSVG className="fixed z-[9998] pointer-events-none text-frame top-2.5 right-2.5 rotate-180 hidden min-[850px]:block" />
			<CornerSVG className="fixed z-[9998] pointer-events-none text-frame bottom-2.5 left-2.5 rotate-0 hidden min-[850px]:block" />
			<CornerSVG className="fixed z-[9998] pointer-events-none text-frame bottom-2.5 right-2.5 -rotate-90 hidden min-[850px]:block" />
		</>
	);
}
