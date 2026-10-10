import { roundCents } from "@/lib/money";

/** The one job the landing follows: the hero day, the chapters and the client demo all show these records. */
export const JOB = {
	quote: "Q-001042",
	invoice: "INV-002094",
	title: "Fall property cleanup",
	client: "Whitfield Property Group",
	contact: "Rachel Whitfield",
	lines: [
		{ id: "leaves", name: "Leaf removal, beds and lawn", price: 420 },
		{ id: "gutters", name: "Gutter clearing", price: 180 },
		{ id: "perennials", name: "Perennial cutback", price: 160 },
		{ id: "haul", name: "Brush haul-away", price: 145 },
		{ id: "mow", name: "Final mow and edge", price: 95 },
	],
	taxRate: 0.0825,
} as const;

export const JOB_SUBTOTAL = JOB.lines.reduce((sum, line) => sum + line.price, 0);
export const JOB_TAX = roundCents(JOB_SUBTOTAL * JOB.taxRate);
export const JOB_TOTAL = roundCents(JOB_SUBTOTAL + JOB_TAX);
