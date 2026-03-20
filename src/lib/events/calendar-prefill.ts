"use client";

/**
 * Lightweight event bus for pre-filling the Calendar CreateEventModal
 * from the AI Drawer. Uses CustomEvent on `window` — no global state needed.
 *
 * Flow:
 * 1. AI Drawer dispatches `calendar:prefill` with event data
 * 2. CalendarPage listens for the event and opens the modal pre-filled
 */

export interface CalendarPrefillData {
  title?: string;
  date?: string; // YYYY-MM-DD
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm
  location?: string;
  description?: string;
  attendees?: string[]; // emails
  createYoodleRoom?: boolean;
  agenda?: string;
  referenceLinks?: string;
}

const EVENT_NAME = "calendar:prefill";

export function dispatchCalendarPrefill(data: CalendarPrefillData) {
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: data }));
}

export function onCalendarPrefill(handler: (data: CalendarPrefillData) => void): () => void {
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<CalendarPrefillData>).detail;
    handler(detail);
  };
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}
