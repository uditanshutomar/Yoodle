import { gmail_v1 } from "googleapis";
import { getGoogleServices } from "./client";

export interface EmailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string[];
  subject: string;
  snippet: string;
  body: string;
  date: string;
  labels: string[];
  isUnread: boolean;
}

export interface SendEmailOptions {
  to: string[];
  subject: string;
  body: string;
  cc?: string[];
  bcc?: string[];
  isHtml?: boolean;
  replyToMessageId?: string;
  threadId?: string;
}

/**
 * List recent emails from the user's inbox.
 */
export async function listEmails(
  userId: string,
  options: { maxResults?: number; query?: string; labelIds?: string[] } = {}
): Promise<EmailMessage[]> {
  const { gmail } = await getGoogleServices(userId);

  const res = await gmail.users.messages.list({
    userId: "me",
    maxResults: options.maxResults || 10,
    q: options.query,
    labelIds: options.labelIds,
  });

  if (!res.data.messages) return [];

  const emails = await Promise.all(
    res.data.messages.map((msg) => getEmailDetails(gmail, msg.id!))
  );

  return emails.filter(Boolean) as EmailMessage[];
}

/**
 * Get full details of a single email.
 */
async function getEmailDetails(
  gmail: gmail_v1.Gmail,
  messageId: string
): Promise<EmailMessage | null> {
  const res = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  const msg = res.data;
  if (!msg) return null;

  const headers = msg.payload?.headers || [];
  const getHeader = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";

  const body = extractBody(msg.payload) || msg.snippet || "";

  return {
    id: msg.id!,
    threadId: msg.threadId!,
    from: getHeader("From"),
    to: getHeader("To").split(",").map((t) => t.trim()),
    subject: getHeader("Subject"),
    snippet: msg.snippet || "",
    body,
    date: getHeader("Date"),
    labels: msg.labelIds || [],
    isUnread: msg.labelIds?.includes("UNREAD") || false,
  };
}

/**
 * Extract the plain text or HTML body from email payload.
 */
function extractBody(payload?: gmail_v1.Schema$MessagePart): string {
  if (!payload) return "";

  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }

  if (payload.parts) {
    // Prefer plain text
    const textPart = payload.parts.find(
      (p) => p.mimeType === "text/plain"
    );
    if (textPart?.body?.data) {
      return Buffer.from(textPart.body.data, "base64url").toString("utf-8");
    }

    // Fall back to HTML
    const htmlPart = payload.parts.find(
      (p) => p.mimeType === "text/html"
    );
    if (htmlPart?.body?.data) {
      return Buffer.from(htmlPart.body.data, "base64url").toString("utf-8");
    }

    // Recursively check nested parts
    for (const part of payload.parts) {
      const body = extractBody(part);
      if (body) return body;
    }
  }

  return "";
}

/**
 * Send an email on behalf of the user.
 */
export async function sendEmail(
  userId: string,
  options: SendEmailOptions
): Promise<{ messageId: string; threadId: string }> {
  const { gmail } = await getGoogleServices(userId);

  const messageParts = [
    `To: ${options.to.join(", ")}`,
    options.cc ? `Cc: ${options.cc.join(", ")}` : "",
    options.bcc ? `Bcc: ${options.bcc.join(", ")}` : "",
    `Subject: ${options.subject}`,
    `Content-Type: ${options.isHtml ? "text/html" : "text/plain"}; charset=utf-8`,
    options.replyToMessageId
      ? `In-Reply-To: ${options.replyToMessageId}`
      : "",
    "",
    options.body,
  ]
    .filter(Boolean)
    .join("\r\n");

  const encodedMessage = Buffer.from(messageParts)
    .toString("base64url");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodedMessage,
      threadId: options.threadId,
    },
  });

  return {
    messageId: res.data.id!,
    threadId: res.data.threadId!,
  };
}

/**
 * Search emails with a query.
 */
export async function searchEmails(
  userId: string,
  query: string,
  maxResults = 10
): Promise<EmailMessage[]> {
  return listEmails(userId, { query, maxResults });
}

/**
 * Get unread email count.
 */
export async function getUnreadCount(userId: string): Promise<number> {
  const { gmail } = await getGoogleServices(userId);

  const res = await gmail.users.labels.get({
    userId: "me",
    id: "INBOX",
  });

  return res.data.messagesUnread || 0;
}

/**
 * Modify email labels (mark read/unread, archive, etc.).
 */
export async function modifyEmailLabels(
  userId: string,
  messageId: string,
  addLabels: string[] = [],
  removeLabels: string[] = []
): Promise<void> {
  const { gmail } = await getGoogleServices(userId);

  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: {
      addLabelIds: addLabels,
      removeLabelIds: removeLabels,
    },
  });
}
