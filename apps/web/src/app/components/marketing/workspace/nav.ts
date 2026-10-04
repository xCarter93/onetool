import { NAV_GROUPS } from "@/components/layout/nav-config";

export const NAV = NAV_GROUPS;

export const SCENE_VIEW: Record<number, { nav: string }> = {
	3: { nav: "Routing" },
	5: { nav: "Quotes" },
	8: { nav: "Automations" },
};
