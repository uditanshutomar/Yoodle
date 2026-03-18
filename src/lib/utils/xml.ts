/**
 * Escape XML-significant characters to prevent injection via user-controlled data.
 * E.g. a malicious email subject containing `</workspace-data>` breaking out of an XML fence.
 */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
