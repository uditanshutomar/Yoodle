"use client";

import { Sparkles } from "lucide-react";

const SUGGESTIONS = [
  "You have meetings today \u2014 check your Rooms",
  "3 stickies are overdue on The Board",
  "Your Vibe Check trend is improving \ud83d\udcc8",
];

export default function YoodlerSaysWidget() {
  return (
    <div className="space-y-2">
      {SUGGESTIONS.map((text) => (
        <div
          key={text}
          className="flex items-start gap-2 rounded-xl bg-[#A855F7]/10 px-3 py-2"
        >
          <Sparkles
            size={14}
            className="mt-0.5 flex-shrink-0 text-[#A855F7]"
            aria-hidden="true"
          />
          <p
            className="text-xs text-[var(--text-secondary)] leading-relaxed font-body"
          >
            {text}
          </p>
        </div>
      ))}
    </div>
  );
}
