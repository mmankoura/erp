"use client"

import type { StepId, StepState } from "@/lib/bom-wizard/steps"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Check, Minus } from "lucide-react"

interface WizardStepperProps {
  steps: StepState[]
  /** Open a step. Only the current step and finished ones are offered. */
  onSelect: (id: StepId) => void
  /** Pass on the current step, when it is one that may be passed on. */
  onSkip: (id: StepId) => void
}

/**
 * Where the user is in the import.
 *
 * Three near-identical steppers were already hand-rolled in this codebase
 * (`bom-import-wizard`, `bom/validate`, `inventory-import-wizard`), each
 * tracking position with `indexOf(step) > i`. This one takes derived state
 * instead, because the wizard's position is a fact about its document rather
 * than a number to keep in step with one — which is what makes undo, deleting a
 * recorded step, and loading a recipe all work here without special cases.
 */
export function WizardStepper({ steps, onSelect, onSkip }: WizardStepperProps) {
  const current = steps.find((s) => s.status === "current")

  return (
    <div className="space-y-2">
      <div className="flex items-start">
        {steps.map((step, i) => {
          const finished = step.status === "done"
          const passed = step.status === "skipped" || step.status === "not-needed"
          const clickable = finished || step.status === "current"

          return (
            <div key={step.id} className="flex items-start min-w-0">
              <button
                type="button"
                disabled={!clickable}
                aria-current={step.status === "current" ? "step" : undefined}
                aria-disabled={!clickable}
                title={step.hint}
                onClick={() => clickable && onSelect(step.id)}
                className={cn(
                  "flex flex-col items-center gap-1 px-1 min-w-0",
                  clickable ? "cursor-pointer" : "cursor-default"
                )}
              >
                <span
                  className={cn(
                    "flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium shrink-0 transition-colors",
                    step.status === "current" && "bg-primary text-primary-foreground",
                    finished && "bg-primary/20 text-primary",
                    passed && "bg-muted text-muted-foreground",
                    step.status === "todo" && "bg-muted text-muted-foreground"
                  )}
                >
                  {finished ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : passed ? (
                    <Minus className="h-3.5 w-3.5" />
                  ) : (
                    step.index
                  )}
                </span>
                <span
                  className={cn(
                    "text-[11px] leading-tight text-center max-w-[7.5rem] truncate",
                    step.status === "current"
                      ? "text-primary font-medium"
                      : "text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>
              </button>

              {i < steps.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    "h-0.5 w-6 lg:w-10 mt-3.5 shrink-0",
                    finished || passed ? "bg-primary/20" : "bg-muted"
                  )}
                />
              )}
            </div>
          )
        })}
      </div>

      {current && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {current.hint && <span className="truncate">{current.hint}</span>}
          {!current.required && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs ml-auto"
              onClick={() => onSkip(current.id)}
            >
              Skip this step
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
