import { Button } from "@/components/ui/button"
import { OnboardingLogo } from "./onboarding-logo"
import { ArrowLeftIcon, LogOutIcon } from "lucide-react"

export function OnboardingHeader({
  canGoBack,
  onBack,
  onSignOut,
}: {
  canGoBack: boolean
  onBack: () => void
  onSignOut?: () => void
}) {
  return (
    <header className="relative z-10 flex min-h-8 shrink-0 items-center justify-between gap-4">
      <OnboardingLogo />

      <div className="flex items-center gap-1">
        {canGoBack ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBack}
            aria-label="Back to previous step"
          >
            <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
            Back
          </Button>
        ) : null}
        {onSignOut ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onSignOut}
            className="text-muted-foreground"
          >
            <LogOutIcon aria-hidden="true" data-icon="inline-start" />
            Sign out
          </Button>
        ) : null}
      </div>
    </header>
  )
}