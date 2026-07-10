"use client";

/**
 * Diagonal-stripe texture fills for categorical chart series (ReUI chart-5
 * pattern recipe). Renders one <pattern> per color; consumers reference them
 * via fill={`url(#${stripeId(index)})`}. Legends/tooltips must keep using the
 * solid color — never the pattern url.
 */
export function stripeId(prefix: string, index: number): string {
	return `${prefix}-${index}`;
}

interface ChartStripeDefsProps {
	colors: string[];
	/** Unique per chart instance so multiple charts on one page don't collide. */
	idPrefix?: string;
}

export function ChartStripeDefs({ colors, idPrefix = "report-stripe" }: ChartStripeDefsProps) {
	return (
		<defs>
			{colors.map((color, index) => (
				<pattern
					key={stripeId(idPrefix, index)}
					id={stripeId(idPrefix, index)}
					patternUnits="userSpaceOnUse"
					width={8}
					height={8}
				>
					<rect width={8} height={8} fill={color} opacity={0.1} />
					<path
						d="M0,8 L8,0 M4,12 L12,4 M-4,4 L4,-4"
						stroke={color}
						strokeWidth={1.5}
						opacity={0.6}
					/>
					<path
						d="M2,10 L10,2 M6,14 L14,6 M-2,6 L6,-2"
						stroke={color}
						strokeWidth={1}
						opacity={0.3}
					/>
				</pattern>
			))}
		</defs>
	);
}
