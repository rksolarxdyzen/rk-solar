"use client";

import { cn } from "@/lib/utils";
import {
  CUSTOMER_SALES_STAGES,
  PIPELINE_SALES_STAGES,
  SALES_STAGE_LABELS,
  isPipelineSalesStage,
} from "@/lib/domain/workflow";
import type { SalesStage } from "@/lib/domain/workflow";
import { requiresSpecializedAdvance } from "@/lib/workflow-rules";
import { Check } from "lucide-react";

export function StageStepper({
  current,
  onStageClick,
  disabled,
  variant = "default",
}: {
  current: SalesStage;
  onStageClick?: (stage: SalesStage) => void;
  disabled?: boolean;
  variant?: "default" | "minimal";
}) {
  const stages = isPipelineSalesStage(current)
    ? PIPELINE_SALES_STAGES
    : CUSTOMER_SALES_STAGES;
  const displayCurrent =
    current === "survey_in_progress" ? "visit_scheduled" : current;
  const currentIdx = stages.indexOf(displayCurrent);

  if (variant === "minimal") {
    return (
      <div className="overflow-x-auto">
        <div className="flex min-w-max items-center gap-0 px-1">
          {stages.map((stage, i) => {
            const isCurrent = stage === displayCurrent;
            const isDone = currentIdx > -1 && i < currentIdx;
            const isNext = currentIdx > -1 && i === currentIdx + 1;
            const clickable =
              !disabled &&
              onStageClick &&
              isNext &&
              !requiresSpecializedAdvance(stage);

            return (
              <div key={stage} className="flex items-center">
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => clickable && onStageClick?.(stage)}
                  className={cn(
                    "flex flex-col items-center gap-1 px-2 py-1.5 transition sm:px-3",
                    clickable && "cursor-pointer"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full text-[0.65rem] font-bold sm:h-6 sm:w-6",
                      isCurrent && "bg-[var(--primary)] text-white ring-2 ring-[var(--primary-light)]",
                      isDone && "bg-[var(--success)] text-white",
                      !isCurrent &&
                        !isDone &&
                        "border border-[var(--border)] bg-[var(--bg)] text-[var(--text-muted)]",
                      clickable && "hover:border-[var(--primary)] hover:text-[var(--primary)]"
                    )}
                  >
                    {isDone ? <Check className="h-3 w-3" /> : i + 1}
                  </span>
                  <span
                    className={cn(
                      "max-w-[4.5rem] text-center text-[0.6rem] font-semibold leading-tight",
                      isCurrent && "text-[var(--primary)]",
                      isDone && "text-[var(--success)]",
                      !isCurrent && !isDone && "text-[var(--text-muted)]"
                    )}
                  >
                    {SALES_STAGE_LABELS[stage]}
                  </span>
                </button>
                {i < stages.length - 1 && (
                  <div
                    className={cn(
                      "mb-4 h-px w-3 shrink-0 sm:w-5",
                      i < currentIdx ? "bg-[var(--success)]" : "bg-[var(--border)]"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex overflow-x-auto rounded-lg border border-[var(--border)]">
      {stages.map((stage, i) => {
        const isCurrent = stage === displayCurrent;
        const isDone = currentIdx > -1 && i < currentIdx;
        const isNext = currentIdx > -1 && i === currentIdx + 1;
        const clickable =
          !disabled &&
          onStageClick &&
          isNext &&
          !requiresSpecializedAdvance(stage);

        return (
          <button
            key={stage}
            type="button"
            disabled={!clickable}
            onClick={() => clickable && onStageClick?.(stage)}
            className={cn(
              "shrink-0 border-r border-[var(--border)] px-3 py-2 text-xs font-semibold transition last:border-r-0",
              isCurrent && "bg-[var(--primary)] text-white",
              isDone && "bg-[var(--success-light)] text-[var(--success)]",
              !isCurrent &&
                !isDone &&
                clickable &&
                "hover:bg-[var(--primary-faint)] hover:text-[var(--primary)]",
              !isCurrent && !isDone && !clickable && "text-[var(--text-muted)] opacity-50"
            )}
          >
            {SALES_STAGE_LABELS[stage]}
          </button>
        );
      })}
    </div>
  );
}
