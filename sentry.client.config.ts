import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Only enable in production (no noise during development)
  enabled: process.env.NODE_ENV === "production",

  // Sample 100% of errors, 10% of transactions for performance
  tracesSampleRate: 0.1,

  // Capture unhandled promise rejections
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      // Capture 10% of sessions, 100% of sessions with errors
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  // Session replay: 10% baseline, 100% on error
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  // Scrub sensitive data from breadcrumbs
  beforeBreadcrumb(breadcrumb) {
    // Remove auth tokens from URL breadcrumbs
    if (breadcrumb.category === "navigation" && breadcrumb.data?.to) {
      const url = breadcrumb.data.to as string;
      if (url.includes("token=") || url.includes("code=")) {
        breadcrumb.data.to = url.replace(/([?&])(token|code)=[^&]*/g, "$1$2=[REDACTED]");
      }
    }
    return breadcrumb;
  },

  // Filter out noisy or sensitive errors
  beforeSend(event) {
    // Don't send errors that contain sensitive patterns
    const message = event.exception?.values?.[0]?.value || "";
    if (message.includes("JWT") || message.includes("token")) {
      // Redact token values from error messages
      if (event.exception?.values?.[0]) {
        event.exception.values[0].value = message.replace(
          /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g,
          "[REDACTED_TOKEN]"
        );
      }
    }
    return event;
  },
});
