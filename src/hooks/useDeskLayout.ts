"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  DEFAULT_LAYOUT,
  WIDGET_REGISTRY,
  type LayoutItem,
} from "@/components/desk/widget-registry";

const STORAGE_KEY = "yoodle:desk-layout";
const DEBOUNCE_MS = 400;

function loadLayout(): LayoutItem[] {
  if (typeof window === "undefined") return DEFAULT_LAYOUT;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw) as LayoutItem[];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_LAYOUT;
    return parsed;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

function persistLayout(layout: LayoutItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

export function useDeskLayout() {
  const [layout, setLayout] = useState<LayoutItem[]>(loadLayout);
  const [editMode, setEditMode] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const updateLayout = useCallback((newLayout: LayoutItem[]) => {
    setLayout(newLayout);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      persistLayout(newLayout);
    }, DEBOUNCE_MS);
  }, []);

  const addWidget = useCallback(
    (id: string) => {
      const meta = WIDGET_REGISTRY[id];
      if (!meta) return;

      // Don't add duplicates
      if (layout.some((item) => item.i === id)) return;

      // Place at the bottom of the grid
      const maxY = layout.reduce(
        (max, item) => Math.max(max, item.y + item.h),
        0,
      );

      const newItem: LayoutItem = {
        i: id,
        x: 0,
        y: maxY,
        w: meta.defaultW,
        h: meta.defaultH,
        minW: meta.minW,
        minH: meta.minH,
      };

      const next = [...layout, newItem];
      setLayout(next);
      persistLayout(next);
    },
    [layout],
  );

  const removeWidget = useCallback(
    (id: string) => {
      const next = layout.filter((item) => item.i !== id);
      setLayout(next);
      persistLayout(next);
    },
    [layout],
  );

  const resetLayout = useCallback(() => {
    setLayout(DEFAULT_LAYOUT);
    persistLayout(DEFAULT_LAYOUT);
  }, []);

  return {
    layout,
    editMode,
    setEditMode,
    updateLayout,
    addWidget,
    removeWidget,
    resetLayout,
  };
}
