// API client for HTTP communication with the backend
class ApiClient {
    constructor(logger) {
        this.logger = logger;
    }

    async loadInitialData() {
        this.logger.addLogEntry('🔄 Loading initial data from server...', 'info');
        
        const results = {
            status: null,
            metrics: null,
            schedule: null
        };

        try {
            // Load current status
            this.logger.addLogEntry('🌐 Fetching current system status...', 'info');
            const statusResponse = await fetch('/api/status');
            if (statusResponse.ok) {
                results.status = await statusResponse.json();
                this.logger.addLogEntry(`✅ Status loaded - Mode: ${results.status.actualWorkMode || 'Unknown'}`, 'info');
            } else {
                this.logger.addLogEntry(`⚠️ Status fetch failed - HTTP ${statusResponse.status}`, 'warn');
            }

            // Load recent metrics
            this.logger.addLogEntry('🌐 Fetching 24h metrics data...', 'info');
            const metricsResponse = await fetch('/api/metrics?hours=24');
            if (metricsResponse.ok) {
                results.metrics = await metricsResponse.json();
                this.logger.addLogEntry(`✅ Metrics loaded - ${Array.isArray(results.metrics) ? results.metrics.length : 0} data points`, 'info');
            } else {
                this.logger.addLogEntry(`⚠️ Metrics fetch failed - HTTP ${metricsResponse.status}`, 'warn');
            }

            // Load schedule
            this.logger.addLogEntry('🌐 Fetching schedule data...', 'info');
            const scheduleResponse = await fetch('/api/schedule');
            if (scheduleResponse.ok) {
                results.schedule = await scheduleResponse.json();
                this.logger.addLogEntry(`✅ Schedule loaded - ${Array.isArray(results.schedule) ? results.schedule.length : 0} blocks`, 'info');
            } else {
                this.logger.addLogEntry(`⚠️ Schedule fetch failed - HTTP ${scheduleResponse.status}`, 'warn');
            }

            this.logger.addLogEntry('✅ Initial data loading completed', 'info');
            return results;
        } catch (error) {
            console.error('Error loading initial data:', error);
            this.logger.addLogEntry(`❌ Failed to load initial data: ${error.message}`, 'error');
            return results;
        }
    }

    async retryOperations() {
        this.logger.addLogEntry('🔄 Initiating retry operations...', 'info');
        try {
            const response = await fetch('/api/retry', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const result = await response.json();
                this.logger.addLogEntry('✅ Retry operation initiated successfully', 'info');
                return result;
            } else {
                this.logger.addLogEntry(`❌ Retry failed - HTTP ${response.status}`, 'error');
                throw new Error('Failed to retry operations');
            }
        } catch (error) {
            console.error('Error retrying operations:', error);
            this.logger.addLogEntry(`❌ Retry operation failed: ${error.message}`, 'error');
            throw error;
        }
    }

    async loadScheduleData() {
        try {
            const response = await fetch('/api/schedule');
            if (response.ok) {
                const scheduleData = await response.json();
                this.logger.addLogEntry('📊 Schedule data loaded successfully', 'info');
                return scheduleData;
            } else {
                this.logger.addLogEntry('❌ Failed to load schedule data', 'error');
                return null;
            }
        } catch (error) {
            console.error('Error loading schedule data:', error);
            this.logger.addLogEntry('❌ Error loading schedule data: ' + error.message, 'error');
            return null;
        }
    }
}