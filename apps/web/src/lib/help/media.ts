/**
 * Cloudinary delivery URLs for help center screenshots and recordings.
 *
 * Public IDs are `OneTool/help/<category>/<article-slug>/<descriptor>`, stored
 * on each media block's `asset` field. URLs carry no version component, so
 * re-uploading over a public ID swaps the image without a code change (use
 * Cloudinary's Replace + invalidate so the CDN copy drops too).
 *
 * `f_auto,q_auto` negotiates AVIF/WebP and quality per browser, which is why
 * these render through a plain <img> rather than next/image — running both
 * would bill two optimization meters for the same result.
 */

// Public by nature: it appears in every delivery URL.
const CLOUD_NAME = "dpiff2nvg";
const PREFIX = "OneTool/help";

const BASE = `https://res.cloudinary.com/${CLOUD_NAME}`;

/** Widths served to the article column, which caps around 800px. */
const IMAGE_WIDTHS = [800, 1600] as const;

export function helpImageUrl(asset: string, width: number): string {
	return `${BASE}/image/upload/f_auto,q_auto,c_limit,w_${width}/${PREFIX}/${asset}`;
}

export function helpImageSrcSet(asset: string): string {
	return IMAGE_WIDTHS.map((w) => `${helpImageUrl(asset, w)} ${w}w`).join(", ");
}

export function helpVideoUrl(asset: string): string {
	return `${BASE}/video/upload/f_auto,q_auto/${PREFIX}/${asset}`;
}

/** First frame, so the player shows the UI instead of a black box. */
export function helpVideoPosterUrl(asset: string): string {
	return `${BASE}/video/upload/so_0,f_auto,q_auto,c_limit,w_1600/${PREFIX}/${asset}.jpg`;
}
