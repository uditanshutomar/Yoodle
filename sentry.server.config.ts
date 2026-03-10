import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Only enable in production
  enabled: process.env.NODE_ENV === "production",

  // Sample 100% of errors, 20% of transactions for performance
  tracesSampleRate: 0.2,

  // Scrub sensitive data from server-side events
  beforeSend(event) {
    // Redact JWT tokens from error messages
    const message = event.exception?.values?.[0]?.value || "";
    if (event.exception?.values?.[0]) {
      event.exception.values[0].value = message.replace(
        /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g,
        "[REDACTED_TOKEN]"
      );
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

    // Redact MongoDB connection strings from error messages
    if (event.exception?.values?.[0]?.value) {
      event.exception.values[0].value = event.exception.values[0].value.replace(
        /mongodb(\+srv)?:\/\/[^\s]+/g,
        "mongodb://[REDACTED]"
      );
    }

    return event;
  },
});
