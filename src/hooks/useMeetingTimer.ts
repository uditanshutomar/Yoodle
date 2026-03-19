"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/** Format seconds as m:ss (or -m:ss for overtime). Pure function — no deps. */
function formatTime(seconds: number): string {
  const abs = Math.abs(seconds);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  const prefix = seconds < 0 ? "-" : "";
  return `${prefix}${m}:${s.toString().padStart(2, "0")}`;
}

interface MeetingTimerOptions {
  meetingId: string;
  /** Scheduled duration in minutes (from DB). Falls back to 15 if absent. */
  scheduledDuration?: number;
  /** Called 1 min before the scheduled end */
  onTimeWarning?: () => void;
}

interface MeetingTimerState {
  /** Seconds elapsed since joining */
  elapsedSeconds: number;
  /** Formatted elapsed time "M:SS" */
  elapsedFormatted: string;
  /** Remaining seconds until scheduled end (-ve means overtime) */
  remainingSeconds: number;
  /** Formatted remaining time "M:SS" or "-M:SS" if overtime */
  remainingFormatted: string;
  /** Whether we're in the warning zone (<=60s remaining) */
  isWarningZone: boolean;
  /** Whether we've gone past the scheduled end */
  isOvertime: boolean;
  /** Current scheduled duration in minutes */
  scheduledDuration: number;
  /** Extend the meeting by N more minutes */
  extendMeeting: (additionalMinutes: number) => Promise<boolean>;
}

export function useMeetingTimer({
  meetingId,
  scheduledDuration: initialDuration,
  onTimeWarning,
}: MeetingTimerOptions): MeetingTimerState {
  const joinTimeRef = useRef(0);
  const isMountedRef = useRef(true);

  // Initialize join time in an effect to satisfy the purity rule (Date.now
  // is impure and can't be called during render). The interval tick guards
  // against joinTimeRef still being 0.
  useEffect(() => {
    if (joinTimeRef.current === 0) {
      joinTimeRef.current = Date.now();
    }
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [scheduledDuration, setScheduledDuration] = useState(initialDuration || 15);
  const warningFiredRef = useRef(false);
  const onTimeWarningRef = useRef(onTimeWarning);
  useEffect(() => { onTimeWarningRef.current = onTimeWarning; }, [onTimeWarning]);

  // Tick every second — guard against joinTimeRef not yet initialized
  useEffect(() => {
    const interval = setInterval(() => {
      if (joinTimeRef.current > 0) {
        setElapsedSeconds(Math.floor((Date.now() - joinTimeRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fire warning at 1 min before end
  const totalScheduledSeconds = scheduledDuration * 60;
  const remainingSeconds = totalScheduledSeconds - elapsedSeconds;
  const isWarningZone = remainingSeconds <= 60 && remainingSeconds > 0;
  const isOvertime = remainingSeconds <= 0;

  useEffect(() => {
    if (isWarningZone && !warningFiredRef.current) {
      warningFiredRef.current = true;
      onTimeWarningRef.current?.();
    }
  }, [isWarningZone]);

  // Reset warning flag if duration is extended
  useEffect(() => {
    if (remainingSeconds > 60) {
      warningFiredRef.current = false;
    }
  }, [remainingSeconds]);

  const extendMeeting = useCallback(
    async (additionalMinutes: number): Promise<boolean> => {
      try {
        const res = await fetch(`/api/meetings/${meetingId}/extend`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ additionalMinutes }),
        });
        if (!res.ok) return false;
        const data = await res.json();
        if (data.success && data.data?.scheduledDuration && isMountedRef.current) {
          setScheduledDuration(data.data.scheduledDuration);
        }
        return true;
      } catch (err) {
        console.warn("[useMeetingTimer] extendMeeting failed:", err);
        return false;
      }
    },
    [meetingId]
  );

  return {
    elapsedSeconds,
    elapsedFormatted: formatTime(elapsedSeconds),
    remainingSeconds,
    remainingFormatted: formatTime(remainingSeconds),
    isWarningZone,
    isOvertime,
    scheduledDuration,
    extendMeeting,
  };
}
