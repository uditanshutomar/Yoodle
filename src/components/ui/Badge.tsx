"use client";

type BadgeVariant = "default" | "success" | "danger" | "info";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-[#FFE600] text-[#0A0A0A]",
  success: "bg-[#22C55E] text-white",
  danger: "bg-[#FF6B6B] text-white",
  info: "bg-[#06B6D4] text-white",
};

export default function Badge({ children, variant = "default", className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold border-2 border-[var(--border-strong)] ${variantStyles[variant]} ${className} font-heading`}
    >
      {children}
    </span>
  );
}
