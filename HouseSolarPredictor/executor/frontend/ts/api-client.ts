import {Logger} from "./logger";
import {InitialDataResponse, MetricInstance, SystemStatus, TimeSegment} from "@shared";

export class ApiClient {
    private readonly logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    async loadInitialData(selectedDate: Date): Promise<InitialDataResponse> {
        const dateStr = selectedDate.toISOString();
        this.logger.addLogEntry(`🔄 Loading initial data from server for ${dateStr}...`, 'info');
        
        const results: InitialDataResponse = {
            status: null,
            metrics: null,
            schedule: null
        };

        try {
            // Load current status (always current, not date-specific)
            this.logger.addLogEntry('🌐 Fetching current system status...', 'info');
            const statusResponse = await fetch('/api/status');
            if (statusResponse.ok) {
                results.status = await statusResponse.json() as SystemStatus;
                this.logger.addLogEntry(`✅ Status loaded - Mode: ${results.status.actualWorkMode || 'Unknown'}`, 'info');
            } else {
                this.logger.addLogEntry(`⚠️ Status fetch failed - HTTP ${statusResponse.status}`, 'warn');
            }

            // Load metrics for the selected date
            this.logger.addLogEntry(`🌐 Fetching 24h metrics data for ${dateStr}...`, 'info');
            const metricsUrl = `/api/metrics?date=${selectedDate}&hours=24`;
            const metricsResponse = await fetch(metricsUrl);
            if (metricsResponse.ok) {
                results.metrics = await metricsResponse.json() as MetricInstance[];
                this.logger.addLogEntry(`✅ Metrics loaded - ${Array.isArray(results.metrics) ? results.metrics.length : 0} data points`, 'info');
            } else {
                this.logger.addLogEntry(`⚠️ Metrics fetch failed - HTTP ${metricsResponse.status}`, 'warn');
            }

            // Load schedule for the selected date
            this.logger.addLogEntry(`🌐 Fetching schedule data for ${dateStr}...`, 'info');
            const scheduleUrl = `/api/schedule?date=${selectedDate}`;
            const scheduleResponse = await fetch(scheduleUrl);
            if (scheduleResponse.ok) {
                results.schedule = await scheduleResponse.json() as TimeSegment[];
                this.logger.addLogEntry(`✅ Schedule loaded - ${Array.isArray(results.schedule) ? results.schedule.length : 0} blocks`, 'info');
            } else {
                this.logger.addLogEntry(`⚠️ Schedule fetch failed - HTTP ${scheduleResponse.status}`, 'warn');
            }

            this.logger.addLogEntry('✅ Initial data loading completed', 'info');
            return results;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('Error loading initial data:', error);
            this.logger.addLogEntry(`❌ Failed to load initial data: ${errorMessage}`, 'error');
            return results;
        }
    }

    async retryOperations(): Promise<any> {
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
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('Error retrying operations:', error);
            this.logger.addLogEntry(`❌ Retry operation failed: ${errorMessage}`, 'error');
            throw error;
        }
    }

    async loadScheduleData(selectedDate: string): Promise<TimeSegment[] | null> {
        if (!selectedDate) {
            this.logger.addLogEntry('❌ No date selected for schedule data', 'error');
            return null;
        }
        
        try {
            const url = `/api/schedule?date=${selectedDate}`;
            this.logger.addLogEntry(`🔄 Loading schedule data from ${url}...`, 'info');
            const response = await fetch(url);
            if (response.ok) {
                const scheduleData = await response.json() as TimeSegment[];
                const dateStr = selectedDate || 'today';
                this.logger.addLogEntry(`📊 Schedule data loaded successfully for ${dateStr}`, 'info');
                return scheduleData;
            } else {
                this.logger.addLogEntry('❌ Failed to load schedule data', 'error');
                return null;
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('Error loading schedule data:', error);
            this.logger.addLogEntry('❌ Error loading schedule data: ' + errorMessage, 'error');
            return null;
        }
    }

    async loadMetricsData(selectedDate: string | null = null, hours: number = 24): Promise<MetricInstance[] | null> {
        try {
            let url = `/api/metrics?hours=${hours}`;
            if (selectedDate) {
                url += `&date=${selectedDate}`;
            }
            this.logger.addLogEntry(`🔄 Loading metrics data from ${url}...`, 'info');
            const response = await fetch(url);
            if (response.ok) {
                const MetricInstance = await response.json() as MetricInstance[];
                const dateStr = selectedDate || 'today';
                this.logger.addLogEntry(`📊 Metrics data loaded successfully for ${dateStr}`, 'info');
                return MetricInstance;
            } else {
                this.logger.addLogEntry('❌ Failed to load metrics data', 'error');
                return null;
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('Error loading metrics data:', error);
            this.logger.addLogEntry('❌ Error loading metrics data: ' + errorMessage, 'error');
            return null;
        }
    }
}
