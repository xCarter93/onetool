/**
 * A-101 act 2 — scene metadata.
 *
 * The rail owns the sheet code, the scrollspy label and the two-tone heading;
 * the scene owns only the stage artwork. Keeping the copy here means the rail
 * never hard-codes a string that belongs to a scene.
 *
 * Copy shape is Attio's rigid grammar (PRD s5): rail label = 2-3 word verb
 * phrase, heading = short bold clause + period, body = one muted mechanism
 * sentence.
 */
export type SceneMeta = {
	/** Stable id — anchor target and React key. */
	id: string;
	/** Scrollspy label on the sheet-tab rail. */
	railLabel: string;
	/** Bold clause. Rendered as the foreground half of the <h2>. */
	heading: string;
	/** Muted mechanism sentence. Same <h2>, muted-foreground. */
	body: string;
};

export const esignMeta = {
	id: "esign",
	railLabel: "Get signed faster",
	heading: "Sent to signed in one visit.",
	body: "Your client taps the quote, signs with a finger, and the deal is done before you're back in the truck.",
} as const satisfies SceneMeta;
