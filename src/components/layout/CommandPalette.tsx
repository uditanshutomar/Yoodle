"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Search,
  Video,
  MessageCircle,
  CheckSquare,
  User,
  Clock,
  X,
} from "lucide-react";

interface SearchResultItem {
  _id: string;
  title?: string;
  name?: string;
  subject?: string;
  conversationId?: string;
}

interface SearchResults {
  meetings: SearchResultItem[];
  messages: SearchResultItem[];
  tasks: SearchResultItem[];
  people: SearchResultItem[];
}

type Category = keyof SearchResults;

const CATEGORY_META: Record<
  Category,
  { label: string; icon: typeof Video; getHref: (item: SearchResultItem) => string }
> = {
  meetings: {
    label: "Meetings",
    icon: Video,
    getHref: (item) => `/meetings/${item._id}`,
  },
  messages: {
    label: "Messages",
    icon: MessageCircle,
    getHref: (item) => `/messages/${item.conversationId || item._id}`,
  },
  tasks: {
    label: "Tasks",
    icon: CheckSquare,
    getHref: () => `/board`,
  },
  people: {
    label: "People",
    icon: User,
    getHref: () => `/messages`,
  },
};

const CATEGORIES: Category[] = ["meetings", "messages", "tasks", "people"];
const RECENT_KEY = "yoodle:recent-searches";
const MAX_RECENT = 5;

function getRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]).slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string) {
  try {
    const recent = getRecentSearches().filter((q) => q !== query);
    recent.unshift(query);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
  } catch {
    // ignore localStorage errors
  }
}

function getItemLabel(item: SearchResultItem): string {
  return item.title || item.name || item.subject || item._id;
}

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Build flat list of navigable items
  const flatItems: { category: Category; item: SearchResultItem }[] = [];
  if (results) {
    for (const cat of CATEGORIES) {
      for (const item of results[cat]) {
        flatItems.push({ category: cat, item });
      }
    }
  }

  const hasResults = flatItems.length > 0;
  const hasQuery = query.trim().length > 0;

  // Global keyboard shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Load recent searches when opening
  useEffect(() => {
    if (open) {
      setRecentSearches(getRecentSearches());
      setQuery("");
      setResults(null);
      setSelectedIndex(0);
      // Focus input after dialog animation
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (!trimmed) {
      setResults(null);
      setLoading(false);
      setSelectedIndex(0);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
        if (!res.ok) throw new Error("Search failed");
        const json = await res.json();
        if (json.success) {
          setResults(json.data);
          setSelectedIndex(0);
        }
      } catch {
        setResults({ meetings: [], messages: [], tasks: [], people: [] });
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const navigate = useCallback(
    (href: string, searchQuery?: string) => {
      if (searchQuery) saveRecentSearch(searchQuery);
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  const handleSelect = useCallback(() => {
    if (!hasResults || selectedIndex >= flatItems.length) return;
    const { category, item } = flatItems[selectedIndex];
    const href = CATEGORY_META[category].getHref(item);
    navigate(href, query.trim());
  }, [flatItems, hasResults, navigate, query, selectedIndex]);

  // Keyboard navigation inside dialog
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (flatItems.length ? (i + 1) % flatItems.length : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => (flatItems.length ? (i - 1 + flatItems.length) % flatItems.length : 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleSelect();
      }
    },
    [flatItems.length, handleSelect],
  );

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  let globalIndex = -1;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild onOpenAutoFocus={(e) => e.preventDefault()}>
              <motion.div
                className="fixed left-1/2 top-[15%] z-[201] w-full max-w-lg -translate-x-1/2 rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[4px_4px_0_var(--border-strong)] outline-none"
                initial={{ opacity: 0, y: -10, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.97 }}
                transition={{ duration: 0.15 }}
                onKeyDown={handleKeyDown}
              >
                {/* Search input */}
                <div className="flex items-center gap-3 border-b-2 border-[var(--border)] px-4 py-3">
                  <Search size={18} className="shrink-0 text-[var(--text-muted)]" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search across meetings, messages, tasks, and more…"
                    className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
                    style={{ fontFamily: "var(--font-body)" }}
                  />
                  {query && (
                    <button
                      onClick={() => setQuery("")}
                      className="shrink-0 rounded-md p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none transition-colors cursor-pointer"
                      aria-label="Clear search"
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  )}
                </div>

                {/* Results area */}
                <div
                  ref={listRef}
                  className="max-h-[360px] overflow-y-auto px-2 py-2"
                  style={{ overscrollBehavior: "contain" }}
                >
                  {/* Loading state */}
                  {loading && (
                    <div className="space-y-2 px-2 py-1">
                      {[...Array(4)].map((_, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                        >
                          <div className="h-8 w-8 rounded-lg bg-[var(--surface-hover)] animate-pulse" />
                          <div className="flex-1 space-y-1.5">
                            <div className="h-3.5 w-3/4 rounded bg-[var(--surface-hover)] animate-pulse" />
                            <div className="h-2.5 w-1/3 rounded bg-[var(--surface-hover)] animate-pulse" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Empty state (no query) */}
                  {!loading && !hasQuery && (
                    <div className="px-3 py-6 text-center">
                      <p
                        className="text-sm text-[var(--text-muted)]"
                        style={{ fontFamily: "var(--font-body)" }}
                      >
                        Search across meetings, messages, tasks, and more
                      </p>
                      {recentSearches.length > 0 && (
                        <div className="mt-4">
                          <p
                            className="mb-2 flex items-center justify-center gap-1.5 text-xs text-[var(--text-muted)]"
                            style={{ fontFamily: "var(--font-heading)" }}
                          >
                            <Clock size={12} />
                            Recent searches
                          </p>
                          <div className="flex flex-wrap justify-center gap-1.5">
                            {recentSearches.map((q) => (
                              <button
                                key={q}
                                onClick={() => setQuery(q)}
                                className="rounded-lg border border-[var(--border)] bg-[var(--surface-hover)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none transition-colors cursor-pointer"
                                style={{ fontFamily: "var(--font-body)" }}
                              >
                                {q}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* No results */}
                  {!loading && hasQuery && results && !hasResults && (
                    <div className="px-3 py-8 text-center">
                      <p
                        className="text-sm text-[var(--text-muted)]"
                        style={{ fontFamily: "var(--font-body)" }}
                      >
                        No results for &ldquo;{query.trim()}&rdquo;
                      </p>
                    </div>
                  )}

                  {/* Results grouped by category */}
                  {!loading &&
                    hasQuery &&
                    results &&
                    hasResults &&
                    CATEGORIES.map((cat) => {
                      const items = results[cat];
                      if (!items || items.length === 0) return null;
                      const { label, icon: Icon, getHref } = CATEGORY_META[cat];
                      return (
                        <div key={cat} className="mb-1">
                          <p
                            className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]"
                            style={{ fontFamily: "var(--font-heading)" }}
                          >
                            {label}
                          </p>
                          {items.map((item) => {
                            globalIndex++;
                            const idx = globalIndex;
                            const isSelected = idx === selectedIndex;
                            return (
                              <button
                                key={item._id}
                                data-index={idx}
                                onClick={() => {
                                  saveRecentSearch(query.trim());
                                  setOpen(false);
                                  router.push(getHref(item));
                                }}
                                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none ${
                                  isSelected
                                    ? "bg-[#FFE600]/20"
                                    : "hover:bg-[var(--surface-hover)]"
                                }`}
                              >
                                <div
                                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                                    isSelected
                                      ? "bg-[#FFE600] text-[#0A0A0A]"
                                      : "bg-[var(--surface-hover)] text-[var(--text-secondary)]"
                                  }`}
                                >
                                  <Icon size={16} aria-hidden="true" />
                                </div>
                                <span
                                  className="truncate text-sm text-[var(--text-primary)]"
                                  style={{ fontFamily: "var(--font-body)" }}
                                >
                                  {getItemLabel(item)}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                </div>

                {/* Footer with keyboard hints */}
                <div className="flex items-center gap-4 border-t-2 border-[var(--border)] px-4 py-2.5">
                  <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
                    <kbd
                      className="rounded border border-[var(--border)] bg-[var(--surface-hover)] px-1.5 py-0.5 text-[10px] font-bold"
                      style={{ fontFamily: "var(--font-heading)" }}
                    >
                      &uarr;&darr;
                    </kbd>
                    <span
                      className="text-[11px]"
                      style={{ fontFamily: "var(--font-body)" }}
                    >
                      Navigate
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
                    <kbd
                      className="rounded border border-[var(--border)] bg-[var(--surface-hover)] px-1.5 py-0.5 text-[10px] font-bold"
                      style={{ fontFamily: "var(--font-heading)" }}
                    >
                      &crarr;
                    </kbd>
                    <span
                      className="text-[11px]"
                      style={{ fontFamily: "var(--font-body)" }}
                    >
                      Open
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
                    <kbd
                      className="rounded border border-[var(--border)] bg-[var(--surface-hover)] px-1.5 py-0.5 text-[10px] font-bold"
                      style={{ fontFamily: "var(--font-heading)" }}
                    >
                      Esc
                    </kbd>
                    <span
                      className="text-[11px]"
                      style={{ fontFamily: "var(--font-body)" }}
                    >
                      Close
                    </span>
                  </div>
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
