import {
  Stepper,
  StepperDescription,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from "@/components/reui/stepper"
import type { OnboardingStep } from "./data"
import { CheckIcon } from "lucide-react"

const SIDEBAR_STEP_DESCRIPTIONS: Record<string, string> = {
  create: "Name and logo.",
  business: "Contact details and address.",
  size: "Team headcount.",
  plan: "Pick the plan that fits.",
  import: "Optional CSV import.",
}

export function OnboardingStepper({
  currentStep,
  isComplete,
  onStepChange,
  steps,
}: {
  currentStep: number
  isComplete: boolean
  onStepChange: (step: number) => void
  steps: OnboardingStep[]
}) {
  return (
    <Stepper
      value={currentStep}
      onValueChange={onStepChange}
      orientation="vertical"
      className="flex w-full flex-col items-start justify-center gap-0"
      indicators={{
        completed: (
          <CheckIcon className="size-3.5" aria-hidden="true" />
        ),
      }}
    >
      <StepperNav aria-label="Onboarding progress" className="w-full">
        {steps.map((step) => {
          const description =
            SIDEBAR_STEP_DESCRIPTIONS[step.id] ?? step.description

          return (
            <StepperItem
              key={step.id}
              step={step.value}
              completed={isComplete || currentStep > step.value}
              className="relative items-start not-last:flex-1"
            >
              <StepperTrigger className="w-full items-start gap-3 pb-5 text-left last:pb-0">
                <StepperIndicator className="bg-foreground text-background ring-border/60 data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=inactive]:bg-muted-foreground/8 data-[state=inactive]:text-muted-foreground data-[state=inactive]:ring-muted-foreground/12 data-[state=completed]:bg-success dark:bg-foreground dark:text-background dark:ring-border/70 dark:data-[state=active]:bg-foreground dark:data-[state=active]:text-background dark:data-[state=inactive]:bg-muted-foreground/14 dark:data-[state=inactive]:text-muted-foreground dark:data-[state=inactive]:ring-muted-foreground/12 size-6 text-xs ring-1 data-[state=completed]:text-white">
                  {step.value}
                </StepperIndicator>
                <div className="mt-0.5 min-w-0 flex-1 text-left">
                  <StepperTitle className="!text-sm !leading-5">
                    {step.label}
                  </StepperTitle>
                  <StepperDescription className="mt-0.5 max-w-none !text-[0.8125rem] !leading-5">
                    {description}
                  </StepperDescription>
                </div>
              </StepperTrigger>
              {step.value < steps.length ? (
                <StepperSeparator className="bg-muted-foreground/12 group-data-[state=active]/step:bg-muted-foreground/12 group-data-[state=inactive]/step:bg-muted-foreground/12 group-data-[state=completed]/step:bg-success dark:bg-muted-foreground/18 dark:group-data-[state=active]/step:bg-muted-foreground/18 dark:group-data-[state=inactive]/step:bg-muted-foreground/18 absolute inset-y-0 top-7 left-3 -order-1 m-0 !h-[calc(100%-2rem)] -translate-x-1/2" />
              ) : null}
            </StepperItem>
          )
        })}
      </StepperNav>
    </Stepper>
  )
}