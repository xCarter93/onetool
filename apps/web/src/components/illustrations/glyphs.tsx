import { cn } from "@/lib/utils";

/**
 * Action glyphs — 24x24 marks for menu rows and tiles.
 *
 * A distinct tier from the empty-state illustrations, not a reuse of them: an
 * illustration is 5:3 and bottom-outs at 56px, so it cannot serve an 18px slot.
 * These share the family's stroke language (1.5 weight, round joins) and echo
 * the corresponding illustration's silhouette, which is what ties the two tiers
 * together without pretending they're the same asset.
 *
 * Colour comes from the parent via currentColor, so the tile sets the hue once.
 */

const glyphs = {
  /** Contact card — echoes clients-none. */
  client: () => (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <circle cx="8.5" cy="11" r="2.2" />
      <path d="M4.9 16.4a4.1 4.1 0 0 1 7.2 0" />
      <path d="M14.5 10h4M14.5 13.5h2.6" />
    </>
  ),
  /** Ascending bars — echoes projects-none. */
  project: () => (
    <>
      <rect x="3.25" y="13" width="4.5" height="7" rx="1.3" />
      <rect x="9.75" y="9" width="4.5" height="11" rx="1.3" />
      <rect x="16.25" y="4.5" width="4.5" height="15.5" rx="1.3" />
    </>
  ),
  /** Folded document — echoes quotes-none. */
  quote: () => (
    <>
      <path d="M5.5 3h8.5L18.5 7.5V21H5.5Z" />
      <path d="M14 3v4.5h4.5" />
      <path d="M8.75 12.5h6.5M8.75 16h4.25" />
    </>
  ),
  /** Checklist — echoes tasks-none. */
  task: () => (
    <>
      <rect x="3.25" y="4.75" width="6.75" height="6.75" rx="1.9" />
      <path d="M5.4 8.1l1.5 1.5 2.6-3" />
      <path d="M13 8.1h7.75" />
      <rect x="3.25" y="13.75" width="6.75" height="6.75" rx="1.9" />
      <path d="M13 17.1h5.25" />
    </>
  ),
} as const;

export type ActionGlyphName = keyof typeof glyphs;

export function ActionGlyph({
  name,
  className,
}: {
  name: ActionGlyphName;
  className?: string;
}) {
  const Art = glyphs[name];
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("ot-glyph size-[18px]", className)}
      aria-hidden="true"
      focusable="false"
      role="presentation"
    >
      <Art />
    </svg>
  );
}
