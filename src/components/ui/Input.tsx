"use client";

import { forwardRef } from "react";
import type { LucideIcon } from "lucide-react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: LucideIcon;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon: Icon, className = "", type = "text", ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            className="text-sm font-bold text-[#0A0A0A]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {label}
          </label>
        )}
        <div className="relative">
          {Icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#0A0A0A]/40">
              <Icon size={18} />
            </div>
          )}
          <input
            ref={ref}
            type={type}
            className={`w-full border-2 border-[#0A0A0A] rounded-xl px-4 py-3 text-sm bg-white text-[#0A0A0A] placeholder:text-[#0A0A0A]/40 focus:outline-none focus:ring-2 focus:ring-[#FFE600] focus:ring-offset-0 transition-all ${
              Icon ? "pl-10" : ""
            } ${error ? "border-[#FF6B6B] focus:ring-[#FF6B6B]" : ""} ${className}`}
            style={{ fontFamily: "var(--font-body)" }}
            {...props}
          />
        </div>
        {error && (
          <span
            className="text-xs font-medium text-[#FF6B6B]"
            style={{ fontFamily: "var(--font-body)" }}
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
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            className="text-sm font-bold text-[#0A0A0A]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          className={`w-full border-2 border-[#0A0A0A] rounded-xl px-4 py-3 text-sm bg-white text-[#0A0A0A] placeholder:text-[#0A0A0A]/40 focus:outline-none focus:ring-2 focus:ring-[#FFE600] focus:ring-offset-0 transition-all resize-none ${
            error ? "border-[#FF6B6B] focus:ring-[#FF6B6B]" : ""
          } ${className}`}
          style={{ fontFamily: "var(--font-body)" }}
          {...props}
        />
        {error && (
          <span
            className="text-xs font-medium text-[#FF6B6B]"
            style={{ fontFamily: "var(--font-body)" }}
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
