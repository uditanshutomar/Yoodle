"use client";

import { m } from "framer-motion";
import { Loader2, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { forwardRef } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonBaseProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: LucideIcon;
  href?: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => void;
  type?: "button" | "submit" | "reset";
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-[#FFE600] text-[#0A0A0A] border-2 border-[var(--border-strong)] shadow-[var(--shadow-card)] hover:shadow-[2px_2px_0_var(--border-strong)] active:shadow-[1px_1px_0_var(--border-strong)]",
  secondary:
    "bg-[var(--surface)] text-[var(--text-primary)] border-2 border-[var(--border-strong)] shadow-[var(--shadow-card)] hover:shadow-[2px_2px_0_var(--border-strong)] active:shadow-[1px_1px_0_var(--border-strong)]",
  ghost:
    "bg-transparent text-[var(--text-primary)] border-0 shadow-none hover:bg-[var(--surface-hover)]",
  danger:
    "bg-[#FF6B6B] text-white border-2 border-[var(--border-strong)] shadow-[var(--shadow-card)] hover:shadow-[2px_2px_0_var(--border-strong)] active:shadow-[1px_1px_0_var(--border-strong)]",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-4 py-1.5 text-sm rounded-lg gap-1.5",
  md: "px-6 py-2.5 text-sm rounded-xl gap-2",
  lg: "px-8 py-3.5 text-base rounded-xl gap-2.5",
};

const iconSizes: Record<ButtonSize, number> = {
  sm: 14,
  md: 16,
  lg: 18,
};

const Button = forwardRef<HTMLButtonElement, ButtonBaseProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      icon: Icon,
      href,
      children,
      className = "",
      disabled = false,
      onClick,
      type = "button",
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-bold font-heading transition-all duration-150 cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none";

    const combinedClassName = `${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`;

    const content = (
      <>
        {loading ? (
          <Loader2 size={iconSizes[size]} className="animate-spin" />
        ) : Icon ? (
          <Icon size={iconSizes[size]} />
        ) : null}
        <span>{children}</span>
      </>
    );

    if (href && !disabled) {
      return (
        <m.div
          whileHover={{ scale: 1.03, y: -1 }}
          whileTap={{ scale: 0.97 }}
        >
          <Link
            href={href}
            className={combinedClassName}
            onClick={onClick as React.MouseEventHandler<HTMLAnchorElement>}
          >
            {content}
          </Link>
        </m.div>
      );
    }

    return (
      <m.button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        className={combinedClassName}
        onClick={onClick as React.MouseEventHandler<HTMLButtonElement>}
        whileHover={disabled || loading ? {} : { scale: 1.03, y: -1 }}
        whileTap={disabled || loading ? {} : { scale: 0.97 }}
      >
        {content}
      </m.button>
    );
  }
);

Button.displayName = "Button";

export default Button;
