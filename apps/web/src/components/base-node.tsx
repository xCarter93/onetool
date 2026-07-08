import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function BaseNode({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "bg-card text-card-foreground relative rounded-md border border-border",
        // Resting elevation so cards lift off the canvas in both themes.
        "shadow-sm transition-[border-color,box-shadow] duration-150",
        // Tint top/right/bottom only — the full `border-color` shorthand would
        // override the per-type `border-l-*` accent bar on hover.
        "hover:border-t-primary/30 hover:border-r-primary/30 hover:border-b-primary/30 hover:shadow-md",
        // React Flow wraps every node in a `.react-flow__node` div and adds the
        // class `selected` to it when selected, so `in-[.selected]` targets the
        // selected state from inside. This is the single selection treatment —
        // a brand-colored ring — so individual node cards must not add their own.
        "in-[.selected]:ring-2 in-[.selected]:ring-primary/60 in-[.selected]:shadow-md",
        className,
      )}
      tabIndex={0}
      {...props}
    />
  );
}

/**
 * A container for a consistent header layout intended to be used inside the
 * `<BaseNode />` component.
 */
export function BaseNodeHeader({
  className,
  ...props
}: ComponentProps<"header">) {
  return (
    <header
      {...props}
      className={cn(
        "mx-0 my-0 -mb-1 flex flex-row items-center justify-between gap-2 px-3 py-2",
        // Remove or modify these classes if you modify the padding in the
        // `<BaseNode />` component.
        className,
      )}
    />
  );
}

/**
 * The title text for the node. To maintain a native application feel, the title
 * text is not selectable.
 */
export function BaseNodeHeaderTitle({
  className,
  ...props
}: ComponentProps<"h3">) {
  return (
    <h3
      data-slot="base-node-title"
      className={cn("user-select-none flex-1 font-semibold", className)}
      {...props}
    />
  );
}

export function BaseNodeContent({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="base-node-content"
      className={cn("flex flex-col gap-y-2 p-3", className)}
      {...props}
    />
  );
}

export function BaseNodeFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="base-node-footer"
      className={cn(
        "flex flex-col items-center gap-y-2 border-t px-3 pt-2 pb-3",
        className,
      )}
      {...props}
    />
  );
}
