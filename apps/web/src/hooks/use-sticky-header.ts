"use client";

import { useEffect, useRef, useState } from "react";
import { getWorkspaceScroller } from "@/lib/workspace-scroller";

export function useStickyHeader() {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [isSticky, setIsSticky] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const media = window.matchMedia("(min-width: 768px)");
    let observer: IntersectionObserver;
    const observe = () => {
      observer?.disconnect();
      observer = new IntersectionObserver(
        ([entry]) => setIsSticky(!entry.isIntersecting),
        {
          root: media.matches ? getWorkspaceScroller() : null,
          rootMargin: media.matches ? "0px" : "-48px 0px 0px 0px",
          threshold: 0,
        },
      );
      observer.observe(sentinel);
    };
    observe();
    media.addEventListener("change", observe);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", observe);
    };
  }, []);

  return { sentinelRef, isSticky };
}
