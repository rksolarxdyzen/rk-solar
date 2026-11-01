import { cn } from "@/lib/utils";
import { forwardRef, type InputHTMLAttributes } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full rounded-lg border-[1.5px] border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-dark)] outline-none transition focus:border-[var(--primary)] focus:shadow-[0_0_0_3px_rgba(15,92,76,0.12)] placeholder:text-[var(--text-muted)]",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export const Label = ({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <label
    className={cn(
      "mb-1.5 block text-[0.69rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]",
      className
    )}
    {...props}
  />
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full min-h-[80px] rounded-lg border-[1.5px] border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--primary)] focus:shadow-[0_0_0_3px_rgba(15,92,76,0.12)]",
      className
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "w-full rounded-lg border-[1.5px] border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--primary)]",
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
);
Select.displayName = "Select";
