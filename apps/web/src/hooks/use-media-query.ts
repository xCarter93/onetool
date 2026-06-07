"use client"

import { useSyncExternalStore } from "react"

export const useMediaQuery = (query: string) => {
  const subscribe = (callback: () => void) => {
    const result = matchMedia(query)
    result.addEventListener("change", callback)
    return () => result.removeEventListener("change", callback)
  }

  // Server snapshot returns undefined to preserve prior SSR behavior.
  return useSyncExternalStore(
    subscribe,
    () => matchMedia(query).matches,
    () => undefined as boolean | undefined,
  )
}
