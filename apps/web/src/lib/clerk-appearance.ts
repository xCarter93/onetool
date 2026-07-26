import { BRAND } from "@/lib/brand";

/** Shared Clerk theme variables for the sidebar widgets (user button, org switcher). */
export const clerkBrandVariables = {
	colorPrimary: BRAND.primary,
	colorTextOnPrimaryBackground: BRAND.onPrimary,
	fontFamily: "inherit",
	borderRadius: "0.5rem",
};

/** Clerk popover card treatment matching the header popovers (rounded-xl, theme tokens). */
export const clerkPopoverCardClass =
	"bg-popover text-popover-foreground border border-border rounded-xl shadow-xl";
