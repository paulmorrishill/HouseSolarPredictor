import * as Sentry from "https://deno.land/x/sentry/index.mjs";

export class Logger {
    public log(message: string) {
        console.log(message);
    }

    public logException(error: Error) {
        console.error("An error occurred:", error);
        Sentry.captureException(error);
    }
}
