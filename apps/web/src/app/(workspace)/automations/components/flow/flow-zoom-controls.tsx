"use client";

import { Maximize, Minus, Plus } from "lucide-react";
import { useReactFlow, useStore } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { cameraMs, fitViewOptionsFor, type CanvasReserve } from "./automation-flow";
import { ShortcutKeys } from "./flow-shortcuts";

const ZOOM_PRESETS: { zoom: number; keys?: string[] }[] = [
	{ zoom: 0.5 },
	{ zoom: 1, keys: ["shift", "0"] },
	{ zoom: 2 },
];

/** Zoom cluster: out, level menu, in, fit. Needs a ReactFlowProvider above. */
export function FlowZoomControls({
	className,
	reserve,
}: {
	className?: string;
	reserve: CanvasReserve;
}) {
	// Only the zoom, so a pan never re-renders the cluster.
	const zoom = useStore((state) => state.transform[2]);
	const minZoom = useStore((state) => state.minZoom);
	const maxZoom = useStore((state) => state.maxZoom);
	const { zoomIn, zoomOut, zoomTo, fitView } = useReactFlow();
	const percent = Math.round(zoom * 100);
	const fit = () => fitView(fitViewOptionsFor(reserve, cameraMs()));

	return (
		<div
			role="group"
			aria-label="Zoom"
			className={cn(
				"flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5",
				className
			)}
		>
			<Tooltip>
				<TooltipTrigger
					render={
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label="Zoom out"
							aria-keyshortcuts="-"
							disabled={zoom <= minZoom}
							onClick={() => zoomOut({ duration: cameraMs(200) })}
						/>
					}
				>
					<Minus />
				</TooltipTrigger>
				<TooltipContent side="bottom" className="flex items-center gap-1.5">
					Zoom out
					<ShortcutKeys keys={["-"]} />
				</TooltipContent>
			</Tooltip>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button
							variant="ghost"
							size="sm"
							aria-label={`Zoom level ${percent}%`}
							// Fixed width so the cluster never shifts as the value gains a digit.
							className="w-14 tabular-nums"
						/>
					}
				>
					{percent}%
				</DropdownMenuTrigger>
				<DropdownMenuContent align="center" className="w-44">
					<DropdownMenuItem onClick={fit}>
						Zoom to fit
						<DropdownMenuShortcut>
							<ShortcutKeys keys={["shift", "1"]} />
						</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					{ZOOM_PRESETS.map((preset) => (
						<DropdownMenuItem
							key={preset.zoom}
							onClick={() => zoomTo(preset.zoom, { duration: cameraMs(200) })}
						>
							Zoom to {preset.zoom * 100}%
							{preset.keys && (
								<DropdownMenuShortcut>
									<ShortcutKeys keys={preset.keys} />
								</DropdownMenuShortcut>
							)}
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
			<Tooltip>
				<TooltipTrigger
					render={
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label="Zoom in"
							aria-keyshortcuts="Plus ="
							disabled={zoom >= maxZoom}
							onClick={() => zoomIn({ duration: cameraMs(200) })}
						/>
					}
				>
					<Plus />
				</TooltipTrigger>
				<TooltipContent side="bottom" className="flex items-center gap-1.5">
					Zoom in
					<ShortcutKeys keys={["+"]} />
				</TooltipContent>
			</Tooltip>
			<span aria-hidden className="mx-0.5 h-4 w-px bg-border" />
			<Tooltip>
				<TooltipTrigger
					render={
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label="Zoom to fit"
							aria-keyshortcuts="Shift+1"
							onClick={fit}
						/>
					}
				>
					<Maximize />
				</TooltipTrigger>
				<TooltipContent side="bottom" className="flex items-center gap-1.5">
					Zoom to fit
					<ShortcutKeys keys={["shift", "1"]} />
				</TooltipContent>
			</Tooltip>
		</div>
	);
}
