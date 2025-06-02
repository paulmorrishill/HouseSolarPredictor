import * as Sentry from "https://deno.land/x/sentry/index.mjs";

export class Logger {
    constructor() {
        // Ensure logs directory exists
        this.ensureLogDirectoryExists();
    }

    private ensureLogDirectoryExists(): void {
        try {
            Deno.statSync("logs");
        } catch {
            Deno.mkdirSync("logs", { recursive: true });
        }
    }

    private getLogFilePath(): string {
        const now = Temporal.Now.instant().toZonedDateTimeISO('Europe/London');
        const dateStr = now.toPlainDate().toString(); // YYYY-MM-DD format
        return `logs/significant-events-${dateStr}.log`;
    }

    public log(message: string) {
        console.log(message);
    }

    public logException(error: Error) {
        console.error("An error occurred:", error);
        Sentry.captureException(error);
    }

    public logSignificant(event: string, data?: Record<string, any>): void {
        const timestamp = Temporal.Now.instant().toZonedDateTimeISO('Europe/London');
        const formattedTimestamp = timestamp.toString({
            timeZoneName: 'never',
            smallestUnit: 'second'
        });
        
        let logEntry = `[${formattedTimestamp}] ${event}\n`;
        
        if (data) {
            const dataLines = Object.entries(data)
                .map(([key, value]) => `  ${key}: ${value}`)
                .join('\n');
            logEntry += dataLines + '\n';
        }
        
        logEntry += '\n';
        
        // Log to console as well (compact format)
        console.log(`📝 SIGNIFICANT: ${event}${data ? ` | ${Object.entries(data).map(([k,v]) => `${k}=${v}`).join(', ')}` : ''}`);
        
        // Append to daily log file
        try {
            const logFilePath = this.getLogFilePath();
            Deno.writeTextFileSync(logFilePath, logEntry, { append: true });
        } catch (error) {
            console.error("Failed to write to significant events log:", error);
        }
    }
}
