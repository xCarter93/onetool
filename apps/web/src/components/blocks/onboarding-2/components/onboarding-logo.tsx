import Image from "next/image"

import { cn } from "@/lib/utils"

export function OnboardingLogo({ className }: { className?: string }) {
  return (
    <div className={cn("inline-flex items-center", className)}>
      <Image
        src="/OneTool-wordmark.png"
        alt="OneTool"
        width={908}
        height={237}
        sizes="112px"
        className="dark:invert dark:brightness-0 h-6 w-auto"
        priority
      />
    </div>
  )
}
