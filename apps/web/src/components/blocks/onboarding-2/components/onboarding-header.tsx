import { Button } from "@/components/ui/button"
import { OnboardingLogo } from "./onboarding-logo"
import { ArrowLeftIcon } from "lucide-react"

export function OnboardingHeader({
  canGoBack,
  onBack,
}: {
  canGoBack: boolean
  onBack: () => void
}) {
  return (
    <header className="relative z-10 flex min-h-8 shrink-0 items-center justify-between gap-4">
      <OnboardingLogo />

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
    </header>
  )
}