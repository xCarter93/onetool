"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useStickyHeader } from "@/hooks/use-sticky-header";

interface StickyDetailHeaderProps {
  children: ReactNode;
}

// Children must be the same height in both states: a height change on stick makes scroll
// anchoring pull scrollTop back over the sentinel, and slow scrolling stalls in a flip loop.
export function StickyDetailHeader({ children }: StickyDetailHeaderProps) {
  const { sentinelRef, isSticky } = useStickyHeader();

  return (
    <>
      <div ref={sentinelRef} className="h-0 w-full" />

      <div
        className={cn(
          "transition-colors duration-150",
          isSticky
            ? "sticky top-12 md:top-0 z-20 bg-background border-b border-border py-4 -ml-6 pl-6 pr-6"
            : "border-b border-border pt-4 pb-4 mb-0 pr-6",
        )}
      >
        {children}
      </div>
    </>
  );
}
