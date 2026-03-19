import * as Sentry from "@sentry/nextjs";

if (process.env.NODE_ENV === "production" && !process.env.NEXT_PUBLIC_SENTRY_DSN) {
  console.error("[sentry:server] NEXT_PUBLIC_SENTRY_DSN is not set — error reporting is DISABLED.");
}

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Only enable in production
  enabled: process.env.NODE_ENV === "production",

  // Sample 100% of errors, 20% of transactions for performance
  tracesSampleRate: 0.2,

  // Scrub sensitive data from server-side events.
  // Iterate ALL exception values in the chain (not just values[0]) —
  // cause chains can leak tokens in nested exceptions.
  beforeSend(event) {
    const jwtRegex = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;
    const mongoRegex = /mongodb(\+srv)?:\/\/[^\s]+/g;

    if (event.exception?.values) {
      for (const exValue of event.exception.values) {
        if (exValue.value) {
          exValue.value = exValue.value
            .replace(jwtRegex, "[REDACTED_TOKEN]")
            .replace(mongoRegex, "mongodb://[REDACTED]");
        }
      }
    }

    // Redact sensitive headers
    if (event.request?.headers) {
      const sensitiveHeaders = ["authorization", "cookie", "x-api-key"];
      for (const header of sensitiveHeaders) {
        if (event.request.headers[header]) {
          event.request.headers[header] = "[REDACTED]";
        }
      }
    }

    // Redact request body — may contain passwords, tokens, or PII in auth flows
    if (event.request?.data) {
      event.request.data = "[REDACTED]";
    }

    // Redact tokens from request URL
    const tokenQueryRegex = /([?&])(token|code|access_token|refresh_token)=[^&]*/g;
    if (event.request?.url) {
      event.request.url = event.request.url
        .replace(jwtRegex, "[REDACTED_TOKEN]")
        .replace(tokenQueryRegex, "$1$2=[REDACTED]");
    }

    // Redact tokens from query string (can be string, Record, or Array)
    if (event.request?.query_string) {
      const qs = event.request.query_string;
      if (typeof qs === "string") {
        event.request.query_string = qs
          .replace(jwtRegex, "[REDACTED_TOKEN]")
          .replace(tokenQueryRegex, "$1$2=[REDACTED]");
      } else if (typeof qs === "object" && !Array.isArray(qs)) {
        const sensitiveKeys = ["token", "code", "access_token", "refresh_token"];
        for (const key of sensitiveKeys) {
          if (key in qs) {
            (qs as Record<string, string>)[key] = "[REDACTED]";
          }
        }
      }
    }

    // Redact parsed cookies (separate from headers.cookie)
    if (event.request?.cookies) {
      const sensitiveCookies = ["yoodle-access-token", "yoodle-refresh-token"];
      for (const cookie of sensitiveCookies) {
        if (event.request.cookies[cookie]) {
          event.request.cookies[cookie] = "[REDACTED]";
        }
      }
    }

    return event;
  },
});
