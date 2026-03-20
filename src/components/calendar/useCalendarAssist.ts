"use client";

import { useState, useRef, useCallback } from "react";

export interface TitleSuggestion {
  value: string;
  reason: string;
}

export interface AttendeeSuggestion {
  userId: string;
  name: string;
  displayName: string;
  avatarUrl: string | null;
  reason: string;
}

export interface AgendaSuggestion {
  value: string;
  reason: string;
}

export interface ReferenceSuggestion {
  title: string;
  url: string;
  type: string;
  reason: string;
}

interface CalendarAssistState {
  titles: TitleSuggestion[];
  attendees: AttendeeSuggestion[];
  agenda: AgendaSuggestion[];
  references: ReferenceSuggestion[];
  suggestYoodleRoom: boolean;
  yoodleRoomReason: string;
  loading: {
    titles: boolean;
    attendees: boolean;
    agenda: boolean;
    references: boolean;
  };
  rateLimited: boolean;
}

const INITIAL_STATE: CalendarAssistState = {
  titles: [],
  attendees: [],
  agenda: [],
  references: [],
  suggestYoodleRoom: false,
  yoodleRoomReason: "",
  loading: { titles: false, attendees: false, agenda: false, references: false },
  rateLimited: false,
};

const DEBOUNCE_MS = 800;
const TIMEOUT_MS = 10_000;

async function fetchAssist(
  body: Record<string, unknown>,
  signal: AbortSignal
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch("/api/ai/calendar-assist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (res.status === 429) return null;
    if (!res.ok) return null;
    const json = await res.json();
    return json.success ? json.data : null;
  } catch {
    return null;
  }
}

export function useCalendarAssist() {
  const [state, setState] = useState<CalendarAssistState>(INITIAL_STATE);
  const abortRefs = useRef<Record<string, AbortController>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rateLimitedRef = useRef(false);

  const cancelField = useCallback((field: string) => {
    abortRefs.current[field]?.abort();
    delete abortRefs.current[field];
  }, []);

  const setLoading = useCallback((field: keyof CalendarAssistState["loading"], val: boolean) => {
    setState((prev) => ({ ...prev, loading: { ...prev.loading, [field]: val } }));
  }, []);

  const fetchTitleSuggestions = useCallback((partial: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (rateLimitedRef.current || partial.length < 3) {
      setState((prev) => ({ ...prev, titles: [] }));
      return;
    }

    debounceRef.current = setTimeout(async () => {
      cancelField("titles");
      const controller = new AbortController();
      abortRefs.current.titles = controller;

      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      setLoading("titles", true);

      const data = await fetchAssist({ field: "titles", partial }, controller.signal);
      clearTimeout(timeout);
      setLoading("titles", false);

      if (data === null && !controller.signal.aborted) {
        rateLimitedRef.current = true;
        setState((prev) => ({ ...prev, rateLimited: true }));
        return;
      }

      if (data) {
        setState((prev) => ({
          ...prev,
          titles: (data.suggestions as TitleSuggestion[]) || [],
          suggestYoodleRoom: (data.suggestYoodleRoom as boolean) || false,
          yoodleRoomReason: (data.yoodleRoomReason as string) || "",
        }));
      }
    }, DEBOUNCE_MS);
  }, [cancelField, setLoading]);

  const fetchAttendeeSuggestions = useCallback(
    async (title: string, existingAttendees: string[]) => {
      if (rateLimitedRef.current || !title.trim()) return;
      cancelField("attendees");
      const controller = new AbortController();
      abortRefs.current.attendees = controller;

      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      setLoading("attendees", true);

      const data = await fetchAssist(
        { field: "attendees", title, existingAttendees },
        controller.signal
      );
      clearTimeout(timeout);
      setLoading("attendees", false);

      if (data === null && !controller.signal.aborted) {
        rateLimitedRef.current = true;
        setState((prev) => ({ ...prev, rateLimited: true }));
        return;
      }

      if (data) {
        setState((prev) => ({
          ...prev,
          attendees: (data.suggestions as AttendeeSuggestion[]) || [],
        }));
      }
    },
    [cancelField, setLoading]
  );

  const fetchAgendaSuggestions = useCallback(
    async (title: string, attendees: string[]) => {
      if (rateLimitedRef.current || !title.trim()) return;
      cancelField("agenda");
      const controller = new AbortController();
      abortRefs.current.agenda = controller;

      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      setLoading("agenda", true);

      const data = await fetchAssist(
        { field: "agenda", title, attendees },
        controller.signal
      );
      clearTimeout(timeout);
      setLoading("agenda", false);

      if (data === null && !controller.signal.aborted) {
        rateLimitedRef.current = true;
        setState((prev) => ({ ...prev, rateLimited: true }));
        return;
      }

      if (data) {
        setState((prev) => ({
          ...prev,
          agenda: (data.suggestions as AgendaSuggestion[]) || [],
        }));
      }
    },
    [cancelField, setLoading]
  );

  const fetchReferenceSuggestions = useCallback(
    async (title: string, attendees: string[], agenda: string) => {
      if (rateLimitedRef.current || !title.trim()) return;
      cancelField("references");
      const controller = new AbortController();
      abortRefs.current.references = controller;

      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      setLoading("references", true);

      const data = await fetchAssist(
        { field: "references", title, attendees, agenda },
        controller.signal
      );
      clearTimeout(timeout);
      setLoading("references", false);

      if (data === null && !controller.signal.aborted) {
        rateLimitedRef.current = true;
        setState((prev) => ({ ...prev, rateLimited: true }));
        return;
      }

      if (data) {
        setState((prev) => ({
          ...prev,
          references: (data.suggestions as ReferenceSuggestion[]) || [],
        }));
      }
    },
    [cancelField, setLoading]
  );

  const dismissTitle = useCallback((index: number) => {
    setState((prev) => ({ ...prev, titles: prev.titles.filter((_, i) => i !== index) }));
  }, []);

  const dismissAttendee = useCallback((userId: string) => {
    setState((prev) => ({ ...prev, attendees: prev.attendees.filter((a) => a.userId !== userId) }));
  }, []);

  const dismissAgenda = useCallback((index: number) => {
    setState((prev) => ({ ...prev, agenda: prev.agenda.filter((_, i) => i !== index) }));
  }, []);

  const dismissReference = useCallback((index: number) => {
    setState((prev) => ({ ...prev, references: prev.references.filter((_, i) => i !== index) }));
  }, []);

  const dismissAllForField = useCallback((field: "titles" | "attendees" | "agenda" | "references") => {
    setState((prev) => ({ ...prev, [field]: [] }));
  }, []);

  const clearDownstream = useCallback((from: "title" | "attendees" | "agenda") => {
    if (from === "title") {
      cancelField("attendees");
      cancelField("agenda");
      cancelField("references");
      setState((prev) => ({ ...prev, attendees: [], agenda: [], references: [] }));
    } else if (from === "attendees") {
      cancelField("agenda");
      cancelField("references");
      setState((prev) => ({ ...prev, agenda: [], references: [] }));
    } else if (from === "agenda") {
      cancelField("references");
      setState((prev) => ({ ...prev, references: [] }));
    }
  }, [cancelField]);

  const reset = useCallback(() => {
    Object.values(abortRefs.current).forEach((c) => c.abort());
    abortRefs.current = {};
    if (debounceRef.current) clearTimeout(debounceRef.current);
    rateLimitedRef.current = false;
    setState(INITIAL_STATE);
  }, []);

  return {
    ...state,
    fetchTitleSuggestions,
    fetchAttendeeSuggestions,
    fetchAgendaSuggestions,
    fetchReferenceSuggestions,
    dismissTitle,
    dismissAttendee,
    dismissAgenda,
    dismissReference,
    dismissAllForField,
    clearDownstream,
    reset,
  };
}
