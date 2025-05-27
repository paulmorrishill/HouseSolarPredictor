// Logger utility for managing log entries and display
class Logger {
    constructor(maxEntries = 100) {
        this.logEntries = [];
        this.maxEntries = maxEntries;
    }

    addLogEntry(message, level = 'info', additional = null) {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = {
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

    updateLogDisplay() {
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

    getLogEntries() {
        return this.logEntries;
    }

    clearLogs() {
        this.logEntries = [];
        this.updateLogDisplay();
    }
}