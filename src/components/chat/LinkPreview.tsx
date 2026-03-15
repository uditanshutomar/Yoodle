"use client";

import { ExternalLink, Video } from "lucide-react";

// ── Helpers ────────────────────────────────────────────────────────────

function extractUrls(text: string): string[] {
  const regex = /https?:\/\/[^\s<)]+/g;
  return (text.match(regex) || []).slice(0, 3);
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

function getPath(url: string): string {
  try {
    const { pathname, search } = new URL(url);
    const full = pathname + search;
    return full.length > 50 ? full.slice(0, 50) + "\u2026" : full;
  } catch {
    return "";
  }
}

function isMeetingLink(url: string): boolean {
  return url.includes("/meetings/");
}

// ── Component ──────────────────────────────────────────────────────────

interface LinkPreviewProps {
  content: string;
}

export default function LinkPreview({ content }: LinkPreviewProps) {
  const urls = extractUrls(content);

  if (urls.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {urls.map((url) =>
        isMeetingLink(url) ? (
          <MeetingPreview key={url} url={url} />
        ) : (
          <GenericPreview key={url} url={url} />
        )
      )}
    </div>
  );
}

// ── Generic URL preview ────────────────────────────────────────────────

function GenericPreview({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 bg-[var(--surface-hover)] border border-[var(--border)] rounded-lg px-3 py-2 mt-2 hover:opacity-80 transition-opacity group"
    >
      <ExternalLink
        size={16}
        className="text-[var(--text-muted)] shrink-0 group-hover:text-[var(--text-primary)]"
      />
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-medium text-[var(--text-primary)] truncate">
          {getDomain(url)}
        </span>
        <span className="text-xs text-[var(--text-muted)] truncate">
          {getPath(url)}
        </span>
      </div>
    </a>
  );
}

// ── Yoodle meeting preview ─────────────────────────────────────────────

function MeetingPreview({ url }: { url: string }) {
  return (
    <div className="flex items-center gap-3 bg-[var(--surface-hover)] border border-[var(--border)] rounded-lg px-3 py-2 mt-2">
      <Video size={18} className="text-[#FFE600] shrink-0" />
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-sm font-medium text-[var(--text-primary)]">
          Yoodle Meeting
        </span>
        <span className="text-xs text-[var(--text-muted)] truncate">
          {getDomain(url)}
          {getPath(url)}
        </span>
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 px-3 py-1 text-xs font-semibold rounded-md bg-[#FFE600] text-black hover:opacity-90 transition-opacity"
      >
        Join
      </a>
    </div>
  );
}
