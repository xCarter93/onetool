import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Width = "prose" | "list" | "detail";

const WIDTH_CLASSES: Record<Width, string> = {
	prose: "mx-auto w-full max-w-6xl",
	list: "mx-auto w-full max-w-7xl",
	detail: "w-full",
};

export function PortalContainer({
	width,
	className,
	children,
}: {
	width: Width;
	className?: string;
	children: ReactNode;
}) {
	return <div className={cn(WIDTH_CLASSES[width], className)}>{children}</div>;
}
