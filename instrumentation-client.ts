import * as Sentry from "@sentry/nextjs";

if (process.env.NODE_ENV === "production" && !process.env.NEXT_PUBLIC_SENTRY_DSN) {
  console.error("[sentry:client] NEXT_PUBLIC_SENTRY_DSN is not set — error reporting is DISABLED.");
}

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  enabled: process.env.NODE_ENV === "production",

  tracesSampleRate: 0.1,

  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  beforeBreadcrumb(breadcrumb) {
    const tokenQueryRegex = /([?&])(token|code|access_token|refresh_token)=[^&]*/g;

    // Scrub navigation breadcrumbs (both "to" and "from" URLs)
    if (breadcrumb.category === "navigation" && breadcrumb.data) {
      for (const key of ["to", "from"] as const) {
        const url = breadcrumb.data[key] as string | undefined;
        if (url && (url.includes("token=") || url.includes("code="))) {
          breadcrumb.data[key] = url.replace(tokenQueryRegex, "$1$2=[REDACTED]");
        }
      }
    }

    // Scrub XHR/fetch breadcrumbs — API calls can include tokens in URLs
    if (
      (breadcrumb.category === "xhr" || breadcrumb.category === "fetch") &&
      breadcrumb.data?.url
    ) {
      const url = breadcrumb.data.url as string;
      if (url.includes("token=") || url.includes("code=")) {
        breadcrumb.data.url = url.replace(tokenQueryRegex, "$1$2=[REDACTED]");
      }
    }

    return breadcrumb;
  },

  // Always scrub JWTs from ALL exception values in the chain — not just
  // values[0]. Cause chains can leak tokens in nested exceptions. Scrubs
  // unconditionally (not gated behind keyword matching).
  beforeSend(event) {
    const jwtRegex =
      /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;
    const tokenQueryRegex =
      /([?&])(token|code|access_token|refresh_token)=[^&]*/g;

    if (event.exception?.values) {
      for (const exValue of event.exception.values) {
        if (exValue.value) {
          exValue.value = exValue.value.replace(jwtRegex, "[REDACTED_TOKEN]");
        }
      }
    }

    // Scrub tokens from request URL (captured from window.location in browsers)
    if (event.request?.url) {
      event.request.url = event.request.url
        .replace(jwtRegex, "[REDACTED_TOKEN]")
        .replace(tokenQueryRegex, "$1$2=[REDACTED]");
    }

    return event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
