/**
 * A-101, act 1 — scene identity.
 *
 * The sticky rail consumes this: `railLabel` is the sheet tab, `heading` and
 * `body` are the act's copy. Kept in its own module so the rail can import the
 * three strings without pulling the scene's markup into its bundle.
 *
 * Copy shape is Attio's rigid grammar, locked in the PRD: rail label = a 2-3
 * word verb phrase, heading = a short bold clause + period, body = one muted
 * mechanism sentence.
 */

export type SceneMeta = {
	/** Stable scene id — also the rail's anchor target. */
	readonly id: string;
	/** Sheet-tab label in the scrollspy rail. */
	readonly railLabel: string;
	/** Bold clause. Ends in a period. */
	readonly heading: string;
	/** One muted mechanism sentence. */
	readonly body: string;
};

export const automationMeta = {
	id: "automation",
	railLabel: "Automate the busywork",
	heading: "Work that runs itself.",
	body: "A quote gets approved at 7am; by 7:01 the invoice is sent and the first visit is on the calendar.",
} as const satisfies SceneMeta;
