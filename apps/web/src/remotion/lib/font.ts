import { loadFont } from "@remotion/google-fonts/Outfit";

// Self-hosted-by-Google load so compositions look right in Studio and
// headless renders too; in the app the same family is already loaded via
// next/font and the browser dedupes.
export const { fontFamily } = loadFont("normal", {
	weights: ["400", "500", "600", "700"],
	subsets: ["latin"],
});
