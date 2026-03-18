"use client";

import ReactMarkdown from "react-markdown";

const DISALLOWED = ["script", "iframe", "object", "embed", "form", "input", "style"] as const;

const components = {
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
    const safe =
      href &&
      (href.startsWith("https://") ||
        href.startsWith("http://") ||
        href.startsWith("/") ||
        href.startsWith("mailto:"));
    return safe ? (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ) : (
      <span>{children}</span>
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
