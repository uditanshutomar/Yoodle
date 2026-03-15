"use client";

import { useState, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";

// ── Inline emoji data (no heavy dependencies) ─────────────────────────
const EMOJI_DATA: Record<string, string[]> = {
  Smileys: [
    "\u{1F600}", "\u{1F603}", "\u{1F604}", "\u{1F601}", "\u{1F606}",
    "\u{1F605}", "\u{1F923}", "\u{1F602}", "\u{1F642}", "\u{1F60A}",
    "\u{1F607}", "\u{1F970}", "\u{1F60D}", "\u{1F929}", "\u{1F618}",
    "\u{1F60B}", "\u{1F61C}", "\u{1F92A}", "\u{1F60E}", "\u{1F913}",
    "\u{1F9D0}", "\u{1F624}", "\u{1F620}", "\u{1F97A}", "\u{1F622}",
    "\u{1F62D}", "\u{1F631}", "\u{1F608}", "\u{1F480}", "\u{1F921}",
  ],
  Gestures: [
    "\u{1F44D}", "\u{1F44E}", "\u{1F44F}", "\u{1F64C}", "\u{1F91D}",
    "\u{1F64F}", "\u{1F4AA}", "\u270C\uFE0F", "\u{1F91E}", "\u{1F919}",
    "\u{1F44B}", "\u270B", "\u{1F590}\uFE0F", "\u{1F446}", "\u{1F447}",
    "\u{1F449}", "\u{1F448}", "\u{1FAF5}", "\u261D\uFE0F", "\u{1FAF6}",
  ],
  Hearts: [
    "\u2764\uFE0F", "\u{1F9E1}", "\u{1F49B}", "\u{1F49A}", "\u{1F499}",
    "\u{1F49C}", "\u{1F5A4}", "\u{1F90D}", "\u{1F495}", "\u{1F49E}",
    "\u{1F493}", "\u{1F497}", "\u{1F496}", "\u{1F498}", "\u{1F49D}",
    "\u2764\uFE0F\u200D\u{1F525}", "\u{1F4AF}", "\u2728", "\u2B50", "\u{1F31F}",
  ],
  Animals: [
    "\u{1F436}", "\u{1F431}", "\u{1F42D}", "\u{1F439}", "\u{1F430}",
    "\u{1F98A}", "\u{1F43B}", "\u{1F43C}", "\u{1F428}", "\u{1F42F}",
    "\u{1F981}", "\u{1F42E}", "\u{1F437}", "\u{1F438}", "\u{1F435}",
    "\u{1F984}", "\u{1F41D}", "\u{1F98B}", "\u{1F419}", "\u{1F42C}",
  ],
  Food: [
    "\u{1F355}", "\u{1F354}", "\u{1F35F}", "\u{1F32D}", "\u{1F37F}",
    "\u{1F9C1}", "\u{1F369}", "\u{1F36A}", "\u{1F382}", "\u{1F36B}",
    "\u2615", "\u{1F375}", "\u{1F9C3}", "\u{1F377}", "\u{1F37A}",
    "\u{1F942}", "\u{1F37E}", "\u{1F9CA}", "\u{1F35C}", "\u{1F363}",
  ],
  Objects: [
    "\u{1F4BB}", "\u{1F4F1}", "\u2328\uFE0F", "\u{1F5A5}\uFE0F", "\u{1F3AE}",
    "\u{1F3AF}", "\u{1F3C6}", "\u{1F3AA}", "\u{1F3A8}", "\u{1F3AC}",
    "\u{1F3B5}", "\u{1F3B8}", "\u{1F4DA}", "\u270F\uFE0F", "\u{1F4CC}",
    "\u{1F527}", "\u{1F4A1}", "\u{1F511}", "\u{1F4E6}", "\u{1F680}",
  ],
};

const CATEGORIES = Object.keys(EMOJI_DATA);

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export default function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0]);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // ── Filtered emojis ─────────────────────────────────────────────────
  const filteredEmojis: Record<string, string[]> = search
    ? Object.fromEntries(
        CATEGORIES.map((cat) => [
          cat,
          EMOJI_DATA[cat].filter(() => {
            // Simple filter: when searching, flatten all categories
            return cat.toLowerCase().includes(search.toLowerCase());
          }),
        ]).filter(([, emojis]) => (emojis as string[]).length > 0)
      )
    : { [activeCategory]: EMOJI_DATA[activeCategory] };

  const allFilteredEmojis = search
    ? CATEGORIES.flatMap((cat) =>
        cat.toLowerCase().includes(search.toLowerCase())
          ? EMOJI_DATA[cat]
          : []
      )
    : null;

  function handleSelect(emoji: string) {
    onSelect(emoji);
    onClose();
  }

  return (
    <div
      ref={containerRef}
      className="max-w-72 max-h-80 flex flex-col bg-[var(--surface)] border-2 border-[var(--border)] rounded-xl shadow-lg overflow-hidden"
    >
      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)]">
        <Search size={14} className="text-[var(--text-muted)] shrink-0" />
        <input
          type="text"
          placeholder="Search emojis..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
          autoFocus
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Category tabs */}
      {!search && (
        <div className="flex gap-1 px-2 py-1.5 border-b border-[var(--border)] overflow-x-auto">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`text-xs px-2 py-1 rounded-md whitespace-nowrap transition-colors ${
                activeCategory === cat
                  ? "bg-[#FFE600] text-black font-semibold"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Emoji grid */}
      <div className="flex-1 overflow-y-auto p-2">
        {search && allFilteredEmojis ? (
          allFilteredEmojis.length > 0 ? (
            <div className="grid grid-cols-8 gap-0.5">
              {allFilteredEmojis.map((emoji, i) => (
                <button
                  key={`${emoji}-${i}`}
                  onClick={() => handleSelect(emoji)}
                  className="w-8 h-8 flex items-center justify-center text-lg rounded-md hover:bg-[var(--surface-hover)] transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--text-muted)] text-center py-4">
              No emojis found
            </p>
          )
        ) : (
          Object.entries(filteredEmojis).map(([cat, emojis]) => (
            <div key={cat}>
              {search && (
                <p className="text-xs text-[var(--text-muted)] mb-1 mt-2 first:mt-0">
                  {cat}
                </p>
              )}
              <div className="grid grid-cols-8 gap-0.5">
                {emojis.map((emoji, i) => (
                  <button
                    key={`${emoji}-${i}`}
                    onClick={() => handleSelect(emoji)}
                    className="w-8 h-8 flex items-center justify-center text-lg rounded-md hover:bg-[var(--surface-hover)] transition-colors"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
