"use client";

import ReactMarkdown from "react-markdown";

const DISALLOWED = ["script", "iframe", "object", "embed", "form", "input", "style"] as const;

const components = {
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
    const safe =
      href &&
      (href.startsWith("https://") ||
        href.startsWith("mailto:") ||
        /^\/(?!\/)/.test(href)); // single-slash relative paths only, blocks //evil.com
    return safe ? (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    );
  },
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="my-2 rounded-xl bg-[var(--surface-hover)] border border-[var(--border)] p-4 overflow-x-auto text-sm">
      {children}
    </pre>
  ),
  code: ({ children, className }: { children?: React.ReactNode; className?: string }) => {
    const isBlock = className?.startsWith("language-");
    return isBlock ? (
      <code className={`font-mono text-sm ${className || ""}`}>{children}</code>
    ) : (
      <code className="rounded bg-[var(--surface-hover)] px-1.5 py-0.5 text-[0.85em] font-mono">{children}</code>
    );
  },
};

interface SafeMarkdownProps {
  children: string;
}

/** ReactMarkdown wrapper with XSS-safe defaults — strips dangerous elements and sanitizes links */
export default function SafeMarkdown({ children }: SafeMarkdownProps) {
  return (
    <ReactMarkdown
      disallowedElements={[...DISALLOWED]}
      unwrapDisallowed
      components={components}
    >
      {children}
    </ReactMarkdown>
  );
}
