"use client"

import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"


const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon
            className="size-4"
          />
        ),
        info: (
          <InfoIcon
            className="size-4"
          />
        ),
        warning: (
          <TriangleAlertIcon
            className="size-4"
          />
        ),
        error: (
          <OctagonXIcon
            className="size-4"
          />
        ),
        loading: (
          <Loader2Icon
            className="size-4 animate-spin"
          />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
          // Sonner's default action button is a solid inverted (black) pill; this
          // is the frosted-blue treatment used by the active pill tabs.
          actionButton:
            "bg-primary/10! text-primary! dark:bg-primary/20! ring-1 ring-primary/30 dark:ring-primary/40 backdrop-blur-sm shadow-sm rounded-full! font-medium hover:bg-primary/20! dark:hover:bg-primary/30!",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
