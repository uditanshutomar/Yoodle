"use client";

import { forwardRef, useId } from "react";
import type { LucideIcon } from "lucide-react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: LucideIcon;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon: Icon, className = "", type = "text", ...props }, ref) => {
    const inputId = useId();
    const errorId = useId();
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-bold text-[var(--text-primary)] font-heading"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {Icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
              <Icon size={18} />
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            type={type}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            className={`w-full border-2 border-[var(--border-strong)] rounded-xl px-4 py-3 text-sm bg-[var(--surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[#FFE600] focus:ring-offset-0 transition-all ${
              Icon ? "pl-10" : ""
            } ${error ? "border-[#FF6B6B] focus:ring-[#FF6B6B]" : ""} ${className} font-body`}
            {...props}
          />
        </div>
        {error && (
          <span
            id={errorId}
            className="text-xs font-medium text-[#FF6B6B] font-body"
          >
            {error}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = "", ...props }, ref) => {
    const textareaId = useId();
    const errorId = useId();
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={textareaId}
            className="text-sm font-bold text-[var(--text-primary)] font-heading"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          className={`w-full border-2 border-[var(--border-strong)] rounded-xl px-4 py-3 text-sm bg-[var(--surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[#FFE600] focus:ring-offset-0 transition-all resize-none ${
            error ? "border-[#FF6B6B] focus:ring-[#FF6B6B]" : ""
          } ${className} font-body`}
          {...props}
        />
        {error && (
          <span
            id={errorId}
            className="text-xs font-medium text-[#FF6B6B] font-body"
          >
            {error}
          </span>
        )}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";

export { Input, Textarea };
export default Input;
