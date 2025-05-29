import { LogLevel } from './types/index.js';
import {LogEntry} from "./types/logEntry";

export class Logger {
    private logEntries: LogEntry[] = [];
    private readonly maxEntries: number;

    constructor(maxEntries: number = 100) {
        this.maxEntries = maxEntries;
    }

    addLogEntry(message: string, level: LogLevel = 'info', additional: any = null): void {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry: LogEntry = {
            timestamp,
            message,
            level
        };

        this.logEntries.unshift(logEntry);
        
        // Keep only the most recent entries
        if (this.logEntries.length > this.maxEntries) {
            this.logEntries = this.logEntries.slice(0, this.maxEntries);
        }

        console.log(`[${timestamp}] [${level}] ${message}`, additional || '');
        this.updateLogDisplay();
    }

    private updateLogDisplay(): void {
        const logContainer = document.getElementById('log-container');
        if (!logContainer) return;

        logContainer.innerHTML = this.logEntries.map(entry => 
            `<div class="log-entry log-${entry.level}">
                <span class="log-timestamp">[${entry.timestamp}]</span>
                <span class="log-message">${entry.message}</span>
            </div>`
        ).join('');

        // Auto-scroll to top (most recent)
        logContainer.scrollTop = 0;
    }

    getLogEntries(): LogEntry[] {
        return [...this.logEntries];
    }

    clearLogs(): void {
        this.logEntries = [];
        this.updateLogDisplay();
    }
}
