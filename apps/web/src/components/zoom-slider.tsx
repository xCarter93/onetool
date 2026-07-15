"use client";

import React from "react";
import { Maximize, Minus, Plus } from "lucide-react";

import {
  Panel,
  useViewport,
  useStore,
  useReactFlow,
  type PanelProps,
  type FitViewOptions,
} from "@xyflow/react";

import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ZoomSlider({
  className,
  orientation = "horizontal",
  fitViewOptions,
  ...props
}: Omit<PanelProps, "children"> & {
  orientation?: "horizontal" | "vertical";
  /** Options for the "fit view" button so it respects overlay padding/zoom caps. */
  fitViewOptions?: FitViewOptions;
}) {
  const { zoom } = useViewport();
  const { zoomTo, zoomIn, zoomOut, fitView } = useReactFlow();
  const minZoom = useStore((state) => state.minZoom);
  const maxZoom = useStore((state) => state.maxZoom);

  return (
    <Panel
      className={cn(
        "bg-card/95 text-foreground border-border flex gap-1 rounded-xl border p-1 shadow-lg backdrop-blur-sm",
        orientation === "horizontal" ? "flex-row" : "flex-col",
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          "flex gap-1",
          orientation === "horizontal" ? "flex-row" : "flex-col-reverse",
        )}
      >
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => zoomOut({ duration: 300 })}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Slider
          className={cn(
            orientation === "horizontal" ? "w-[140px]" : "h-[140px]",
          )}
          orientation={orientation}
          value={[zoom]}
          min={minZoom}
          max={maxZoom}
          step={0.01}
          onValueChange={(values) =>
            zoomTo(Array.isArray(values) ? values[0] : values)
          }
        />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => zoomIn({ duration: 300 })}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <Button
        className={cn(
          "tabular-nums",
          orientation === "horizontal"
            ? "w-[140px] min-w-10"
            : "h-[40px] w-[40px]",
        )}
        variant="ghost"
        size="sm"
        onClick={() => zoomTo(1, { duration: 300 })}
      >
        {(100 * zoom).toFixed(0)}%
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => fitView(fitViewOptions ?? { duration: 300 })}
      >
        <Maximize className="h-4 w-4" />
      </Button>
    </Panel>
  );
}
