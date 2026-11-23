import * as Sentry from '@sentry/nestjs';

// Must be imported before anything else in main.ts so Sentry can patch
// modules. No-op when SENTRY_DSN is unset (local dev, tests).
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  release: process.env.SENTRY_RELEASE,
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  // Clinical data: never attach IPs, cookies or headers automatically.
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    databaseQueryData: false,
  },
  beforeSend(event) {
    // Request bodies carry patient data and WhatsApp payloads.
    if (event.request) {
      delete event.request.data;
      delete event.request.cookies;
    }
    return event;
  },
});
