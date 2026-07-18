import { cn } from "@/lib/utils";

// Vendored from a ReUI empty-state pattern: a hub-and-spoke node diagram.
// Scales via className (viewBox preserved); colors resolve from theme tokens.
export function NodesIllustration({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 200 120"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			aria-hidden="true"
			className={cn("h-[120px] w-[200px]", className)}
		>
			{/* Connection lines */}
			<line
				x1="100"
				y1="60"
				x2="44"
				y2="30"
				className="stroke-border"
				strokeWidth="1.5"
				strokeDasharray="4 3"
			/>
			<line
				x1="100"
				y1="60"
				x2="44"
				y2="90"
				className="stroke-border"
				strokeWidth="1.5"
				strokeDasharray="4 3"
			/>
			<line
				x1="100"
				y1="60"
				x2="156"
				y2="30"
				className="stroke-border"
				strokeWidth="1.5"
				strokeDasharray="4 3"
			/>
			<line
				x1="100"
				y1="60"
				x2="156"
				y2="90"
				className="stroke-border"
				strokeWidth="1.5"
				strokeDasharray="4 3"
			/>

			{/* Center node */}
			<circle
				cx="100"
				cy="60"
				r="18"
				className="fill-primary/10 dark:fill-primary/15 stroke-primary/40"
				strokeWidth="1.5"
			/>
			<circle cx="100" cy="60" r="6" className="fill-primary/30" />
			<circle cx="100" cy="60" r="2.5" className="fill-primary" />

			{/* Top-left node */}
			<circle
				cx="44"
				cy="30"
				r="14"
				className="fill-muted dark:fill-muted/60 stroke-border"
				strokeWidth="1.5"
			/>
			<rect
				x="37"
				y="26"
				width="14"
				height="3"
				rx="1.5"
				className="fill-muted-foreground/20"
			/>
			<rect
				x="40"
				y="32"
				width="8"
				height="2"
				rx="1"
				className="fill-muted-foreground/12"
			/>

			{/* Bottom-left node */}
			<circle
				cx="44"
				cy="90"
				r="14"
				className="fill-muted dark:fill-muted/60 stroke-border"
				strokeWidth="1.5"
			/>
			<rect
				x="37"
				y="86"
				width="14"
				height="3"
				rx="1.5"
				className="fill-muted-foreground/20"
			/>
			<rect
				x="40"
				y="92"
				width="8"
				height="2"
				rx="1"
				className="fill-muted-foreground/12"
			/>

			{/* Top-right node */}
			<circle
				cx="156"
				cy="30"
				r="14"
				className="fill-muted dark:fill-muted/60 stroke-border"
				strokeWidth="1.5"
			/>
			<rect
				x="149"
				y="26"
				width="14"
				height="3"
				rx="1.5"
				className="fill-muted-foreground/20"
			/>
			<rect
				x="152"
				y="32"
				width="8"
				height="2"
				rx="1"
				className="fill-muted-foreground/12"
			/>

			{/* Bottom-right node */}
			<circle
				cx="156"
				cy="90"
				r="14"
				className="fill-muted dark:fill-muted/60 stroke-border"
				strokeWidth="1.5"
			/>
			<rect
				x="149"
				y="86"
				width="14"
				height="3"
				rx="1.5"
				className="fill-muted-foreground/20"
			/>
			<rect
				x="152"
				y="92"
				width="8"
				height="2"
				rx="1"
				className="fill-muted-foreground/12"
			/>

			{/* Small floating dots */}
			<circle cx="72" cy="40" r="2" className="fill-primary/15" />
			<circle cx="128" cy="80" r="2" className="fill-primary/15" />
			<circle cx="72" cy="80" r="1.5" className="fill-muted-foreground/10" />
			<circle cx="128" cy="40" r="1.5" className="fill-muted-foreground/10" />
		</svg>
	);
}
