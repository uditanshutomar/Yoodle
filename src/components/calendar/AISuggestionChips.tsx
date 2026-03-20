"use client";

import { Sparkles, X, User, FileText, File } from "lucide-react";

export interface ChipSuggestion {
  label: string;
  sublabel?: string;
  avatarUrl?: string | null;
  icon?: "user" | "doc" | "sheet" | "slide" | "pdf" | "file" | "agenda";
  reason: string;
}

interface AISuggestionChipsProps {
  suggestions: ChipSuggestion[];
  loading: boolean;
  onAccept: (index: number) => void;
  onDismiss: (index: number) => void;
  onDismissAll: () => void;
  label?: string;
}

const iconMap: Record<string, typeof User> = {
  user: User,
  doc: FileText,
  sheet: FileText,
  slide: FileText,
  pdf: File,
  file: File,
  agenda: FileText,
};

function SkeletonChip() {
  return (
    <div className="animate-pulse flex items-center gap-2 rounded-xl border-2 border-neutral-200 bg-neutral-50 px-3 py-2 h-14 w-48" />
  );
}

export function AISuggestionChips({
  suggestions,
  loading,
  onAccept,
  onDismiss,
  onDismissAll,
  label = "AI Suggestions",
}: AISuggestionChipsProps) {
  if (!loading && suggestions.length === 0) return null;

  return (
    <div className="mt-2 rounded-2xl border-2 border-neutral-900 bg-[#FFFEF5] p-3 shadow-[3px_3px_0_0_#FFE600]">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-700">
          <Sparkles className="h-3.5 w-3.5 text-yellow-500" />
          {label}
        </div>
        {suggestions.length > 1 && (
          <button
            type="button"
            onClick={onDismissAll}
            className="text-[10px] text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            Dismiss all
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {loading && suggestions.length === 0 && (
          <>
            <SkeletonChip />
            <SkeletonChip />
            <SkeletonChip />
          </>
        )}

        {suggestions.map((s, i) => {
          const Icon = s.icon ? iconMap[s.icon] || null : null;
          return (
            <button
              key={`${s.label}-${i}`}
              type="button"
              onClick={() => onAccept(i)}
              className="group relative flex items-center gap-2 rounded-xl border-2 border-neutral-900 bg-white px-3 py-1.5 text-left transition-all hover:bg-[#FFE600] hover:shadow-[2px_2px_0_0_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
            >
              {s.avatarUrl ? (
                <img
                  src={s.avatarUrl}
                  alt=""
                  className="h-6 w-6 rounded-full border border-neutral-300 object-cover"
                />
              ) : Icon ? (
                <Icon className="h-4 w-4 text-neutral-500 flex-shrink-0" />
              ) : null}

              <div className="min-w-0">
                <div className="text-xs font-medium text-neutral-900 truncate max-w-[180px]">
                  {s.label}
                </div>
                <div className="text-[10px] text-neutral-500 truncate max-w-[180px]">
                  {s.reason}
                </div>
              </div>

              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss(i);
                }}
                className="ml-1 flex-shrink-0 rounded-full p-0.5 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700"
              >
                <X className="h-3 w-3" />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
