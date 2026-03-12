import * as Sentry from "@sentry/nextjs";

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
    if (breadcrumb.category === "navigation" && breadcrumb.data?.to) {
      const url = breadcrumb.data.to as string;
      if (url.includes("token=") || url.includes("code=")) {
        breadcrumb.data.to = url.replace(
          /([?&])(token|code)=[^&]*/g,
          "$1$2=[REDACTED]",
        );
      }
    }
    return breadcrumb;
  },

  beforeSend(event) {
    const message = event.exception?.values?.[0]?.value || "";
    if (message.includes("JWT") || message.includes("token")) {
      if (event.exception?.values?.[0]) {
        event.exception.values[0].value = message.replace(
          /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g,
          "[REDACTED_TOKEN]",
        );
      }
    }
    return event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
