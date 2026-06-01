import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  enableLogs: true,
  ignoreErrors: [
    "NEXT_REDIRECT",
    "AbortError",
    "ResizeObserver loop",
    "chrome-extension://",
    "moz-extension://",
  ],
});
