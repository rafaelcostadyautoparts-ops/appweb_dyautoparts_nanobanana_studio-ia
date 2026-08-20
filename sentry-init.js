import * as Sentry from "@sentry/browser";

Sentry.init({
    dsn: "https://b3307f721d55c14d2203816878cacbc2@o4511940296245248.ingest.us.sentry.io/4511940371480576",
});

window.Sentry = Sentry;