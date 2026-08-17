import { getRemotionEnvironment } from "remotion";
import { loadFont } from "@remotion/google-fonts/Outfit";

// Studio and headless renders have no next/font, so they load Outfit from
// Google. The app must NOT: next/font self-hosts Outfit on our own origin, and
// a second copy from fonts.gstatic.com never dedupes across origins — it cost a
// duplicate ~32KB woff2 on the landing page and was the longest critical-path
// chain in Lighthouse (plus a font-display warning we don't control).
// In the Player the scenes sit inside <body class={outfit.className}>, so
// `inherit` picks up the already-loaded next/font family.
const { isRendering, isStudio } = getRemotionEnvironment();

export const fontFamily =
	isRendering || isStudio
		? loadFont("normal", {
				weights: ["400", "500", "600", "700"],
				subsets: ["latin"],
			}).fontFamily
		: "inherit";
