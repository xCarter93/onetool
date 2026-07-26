import { ReactNode } from "react";

/**
 * A notch that bulges downward from the picture-frame band above the content
 * card. The whole outline — the ogee (S-curve) side sweeps and the floor — is
 * a single `border-shape` path (see .header-notch in globals.css), so the
 * sidebar-colored background follows the geometry. The --notch-sweep side
 * padding reserves the sweep region so content sits on the flat floor;
 * `border-shape`-unaware browsers fall back to a plain rounded-b tab.
 */
export function NotchedItem({
	children,
	contentClassName,
}: {
	children: ReactNode;
	contentClassName?: string;
}) {
	return (
		<div
			className={`header-notch px-(--notch-sweep) rounded-b-xl flex items-center ${contentClassName ?? ""}`}
		>
			{children}
		</div>
	);
}
