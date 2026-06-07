"use client"

import { useCallback, useSyncExternalStore } from "react"

export const useMediaQuery = (query: string) => {
  // Stabilise subscribe so useSyncExternalStore doesn't re-subscribe every render.
  const subscribe = useCallback(
    (callback: () => void) => {
      const result = matchMedia(query)
      result.addEventListener("change", callback)
      return () => result.removeEventListener("change", callback)
    },
    [query],
  )

  // Server snapshot returns undefined to preserve prior SSR behavior.
  return useSyncExternalStore(
    subscribe,
    () => matchMedia(query).matches,
    () => undefined as boolean | undefined,
  )
}
