import { Caveat } from "next/font/google";

/**
 * Caveat — the ONE handwriting moment on the whole page.
 *
 * Caveat is only ever a SIGNATURE. Never a heading, never an accent, never a
 * pull quote. The contrast between Outfit everywhere and one line of Caveat is
 * the entire emotional payload of this scene; used twice it is a novelty font.
 *
 * Loaded here rather than at the route root so the face is requested by the
 * scene that uses it and by nothing else, and `display: "swap"` means a slow
 * font never blocks the signature line from painting — the fallback renders,
 * then the real face swaps in. (The scene's own reveal is a clip wipe on the
 * span, so a swap mid-wipe is invisible.)
 *
 * 600 only: the portal's typed-signature pad renders at Caveat 600 and the
 * exported PNG uses the same weight, so a lighter cut here would be a lie about
 * what the client actually signs.
 */
export const caveat = Caveat({
	subsets: ["latin"],
	weight: ["600"],
	display: "swap",
	variable: "--font-esign-caveat",
});
