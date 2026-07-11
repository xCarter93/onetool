"use client"

import { useSyncExternalStore } from "react"

import { DitheringShader } from "./dithering-shader"

let webGL2Support: boolean | null = null

function subscribeToWebGL2Support() {
  return () => {}
}

function getWebGL2Support() {
  if (webGL2Support !== null) {
    return webGL2Support
  }

  if (typeof document === "undefined") {
    return false
  }

  const canvas = document.createElement("canvas")
  webGL2Support = Boolean(canvas.getContext("webgl2"))

  return webGL2Support
}

function getServerWebGL2Support() {
  return false
}

function useSupportsWebGL2() {
  return useSyncExternalStore(
    subscribeToWebGL2Support,
    getWebGL2Support,
    getServerWebGL2Support
  )
}

function subscribeToThemeClass(onStoreChange: () => void) {
  if (typeof document === "undefined") {
    return () => {}
  }

  const observer = new MutationObserver(onStoreChange)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  })

  return () => observer.disconnect()
}

function getThemeClassSnapshot() {
  return (
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
  )
}

function getServerThemeClassSnapshot() {
  return false
}

function useIsDarkTheme() {
  return useSyncExternalStore(
    subscribeToThemeClass,
    getThemeClassSnapshot,
    getServerThemeClassSnapshot
  )
}

function getThemeColorToken(name: string, fallback: string) {
  if (typeof document === "undefined") {
    return fallback
  }

  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    fallback
  )
}

function withColorAlpha(color: string, alpha: number) {
  const trimmed = color.trim()

  if (/^oklch\(/i.test(trimmed)) {
    return trimmed
      .replace(/\s*\/\s*[^)]+(?=\))/, "")
      .replace(/\)$/, ` / ${alpha})`)
  }

  // rgb(r, g, b) — the light-theme --primary token shape
  const rgb = /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)/i.exec(
    trimmed
  )
  if (rgb) {
    return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`
  }

  return color
}

export function OnboardingPageBackground() {
  const supportsWebGL2 = useSupportsWebGL2()
  const isDark = useIsDarkTheme()
  // Fully transparent back: any tinted wash renders as a visible slab across
  // the canvas rect. Only the primary-blue dither wave paints.
  const colorBack = "rgba(0, 0, 0, 0)"
  // OneTool primary blue drives the dithered wave in both themes.
  const colorFront = withColorAlpha(
    getThemeColorToken(
      "--primary",
      isDark ? "oklch(0.685 0.169 237.323)" : "rgb(0, 166, 244)"
    ),
    isDark ? 0.3 : 0.26
  )

  if (!supportsWebGL2) {
    return null
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      <div className="absolute inset-x-0 bottom-0 h-[58svh] min-h-[28rem] opacity-58 dark:opacity-45">
        <DitheringShader
          className="absolute inset-0"
          style={{ transform: "translateY(24%)" }}
          shape="wave"
          type="8x8"
          colorBack={colorBack}
          colorFront={colorFront}
          pxSize={3}
          speed={0.45}
        />
      </div>
    </div>
  )
}