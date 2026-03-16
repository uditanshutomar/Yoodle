"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Plus, X } from "lucide-react";

interface MeetingTimerBannerProps {
  remainingFormatted: string;
  remainingSeconds: number;
  isWarningZone: boolean;
  isOvertime: boolean;
  isHost: boolean;
  onExtend: (minutes: number) => Promise<boolean>;
  onDismiss: () => void;
}

const EXTEND_OPTIONS = [15, 30, 45, 60];

export default function MeetingTimerBanner({
  remainingFormatted,
  remainingSeconds,
  isWarningZone,
  isOvertime,
  isHost,
  onExtend,
  onDismiss,
}: MeetingTimerBannerProps) {
  const [showExtendOptions, setShowExtendOptions] = useState(false);
  const [extending, setExtending] = useState(false);
  const [extended, setExtended] = useState(false);
  const dismissTimerRef = useRef<NodeJS.Timeout>(undefined);

  useEffect(() => {
    return () => clearTimeout(dismissTimerRef.current);
  }, []);

  const handleExtend = async (minutes: number) => {
    setExtending(true);
    const ok = await onExtend(minutes);
    setExtending(false);
    if (ok) {
      setExtended(true);
      setShowExtendOptions(false);
      // Auto-dismiss after 2s
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = setTimeout(() => {
        setExtended(false);
        onDismiss();
      }, 2000);
    }
  };

  // Only show when warning zone or overtime
  if (!isWarningZone && !isOvertime) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className={`
          relative z-30 mx-4 mt-2 flex items-center gap-3 rounded-xl border-2 px-4 py-2.5
          ${isOvertime
            ? "border-[#FF6B6B] bg-[#FF6B6B]/10"
            : "border-[#FFB800] bg-[#FFB800]/10"
          }
        `}
      >
        {/* Icon */}
        <Clock
          size={16}
          className={isOvertime ? "text-[#FF6B6B]" : "text-[#FFB800]"}
        />

        {/* Message */}
        <div className="flex-1 text-sm">
          {extended ? (
            <span className="font-medium text-[#22C55E]">
              Meeting extended!
            </span>
          ) : isOvertime ? (
            <span className="font-medium text-[#FF6B6B]">
              Meeting is {remainingFormatted.replace("-", "")} overtime
            </span>
          ) : (
            <span className="font-medium text-[#FFB800]">
              {remainingSeconds <= 30 ? (
                <>{remainingFormatted} left &mdash; ending soon</>
              ) : (
                <>~1 min left &mdash; extend?</>
              )}
            </span>
          )}
        </div>

        {/* Extend options — host only */}
        {isHost && !extended && (
          <>
            {showExtendOptions ? (
              <div className="flex items-center gap-1.5">
                {EXTEND_OPTIONS.map((min) => (
                  <button
                    key={min}
                    onClick={() => handleExtend(min)}
                    disabled={extending}
                    className={`
                      rounded-full border-2 border-[#0A0A0A] px-2.5 py-0.5 text-xs font-bold
                      shadow-[1px_1px_0_#0A0A0A] transition-all
                      hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px]
                      ${extending ? "opacity-50 cursor-wait" : "bg-white text-[#0A0A0A]"}
                    `}
                    style={{ fontFamily: "var(--font-heading)" }}
                  >
                    +{min}m
                  </button>
                ))}
                <button
                  onClick={() => setShowExtendOptions(false)}
                  className="ml-1 rounded-full p-1 hover:bg-black/5"
                >
                  <X size={12} className="text-[#0A0A0A]/40" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowExtendOptions(true)}
                className="flex items-center gap-1 rounded-full border-2 border-[#0A0A0A] bg-white px-3 py-1 text-xs font-bold shadow-[2px_2px_0_#0A0A0A] transition-all hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                <Plus size={12} />
                Extend
              </button>
            )}
          </>
        )}

        {/* Dismiss */}
        {!showExtendOptions && !extended && (
          <button
            onClick={onDismiss}
            className="rounded-full p-1 hover:bg-black/5"
          >
            <X size={14} className="text-[#0A0A0A]/30" />
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
