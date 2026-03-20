"use client";

import Image from "next/image";

type AvatarSize = "sm" | "md" | "lg";
type AvatarStatus = "online" | "offline" | "in-meeting" | "dnd";

interface AvatarProps {
  src?: string | null;
  name?: string;
  size?: AvatarSize;
  status?: AvatarStatus;
  className?: string;
}

const sizeStyles: Record<AvatarSize, { container: string; text: string; dot: string; dotPos: string; imgSize: number }> = {
  sm: {
    container: "h-8 w-8",
    text: "text-xs",
    dot: "h-2.5 w-2.5",
    dotPos: "-bottom-0.5 -right-0.5",
    imgSize: 32,
  },
  md: {
    container: "h-10 w-10",
    text: "text-sm",
    dot: "h-3 w-3",
    dotPos: "-bottom-0.5 -right-0.5",
    imgSize: 40,
  },
  lg: {
    container: "h-14 w-14",
    text: "text-lg",
    dot: "h-3.5 w-3.5",
    dotPos: "bottom-0 right-0",
    imgSize: 56,
  },
};

const statusColors: Record<AvatarStatus, string> = {
  online: "bg-green-400",
  offline: "bg-gray-400",
  "in-meeting": "bg-[#FFE600]",
  dnd: "bg-[#FF6B6B]",
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getAvatarColor(name: string): string {
  const colors = ["#FFE600", "#FF6B6B", "#7C3AED", "#06B6D4", "#22C55E", "#F97316"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export default function Avatar({ src, name = "", size = "md", status, className = "" }: AvatarProps) {
  const s = sizeStyles[size];

  return (
    <div className={`relative inline-flex shrink-0 ${className}`}>
      <div
        className={`${s.container} rounded-full border-2 border-[var(--border-strong)] overflow-hidden flex items-center justify-center font-bold`}
        style={{
          backgroundColor: src ? "transparent" : getAvatarColor(name),
          }}
      >
        {src ? (
          <Image
            src={src}
            alt={name}
            width={s.imgSize}
            height={s.imgSize}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className={`${s.text} text-[var(--text-primary)] select-none`}>
            {name ? getInitials(name) : "?"}
          </span>
        )}
      </div>
      {status && (
        <span
          className={`absolute ${s.dotPos} ${s.dot} ${statusColors[status]} rounded-full border-2 border-[var(--surface)]`}
          aria-label={status}
          role="status"
        />
      )}
    </div>
  );
}
