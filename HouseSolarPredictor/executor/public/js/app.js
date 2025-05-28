// Solar Inverter Control System Frontend - Main Application
class SolarInverterApp {
    constructor() {
        // Initialize core properties
        this.allMetricsData = []; // Store all 24 hours of data
        this.currentTimeRange = 4; // Default to 4 hours
        this.maxDataPoints = 100; // Maximum data points per chart
        let today = new Date();
        today.setHours(0, 0, 0, 0);
        this.selectedDate =  today// Default to today
        
        // Initialize modules
        this.logger = new Logger(100);
        this.apiClient = new ApiClient(this.logger);
        this.dataProcessor = new DataProcessor(this.logger);
        this.uiManager = new UIManager(this.logger);
        this.chartManager = new ChartManager(this.logger, this.dataProcessor);
        this.scheduleManager = new ScheduleManager(this.logger, this.dataProcessor, this.uiManager);
        
        // Initialize WebSocket manager with message handler
        this.websocketManager = new WebSocketManager(this.logger, (message) => {
            this.handleWebSocketMessage(message);
        });
        
        this.init();
    }

    init() {
        this.logger.addLogEntry('🚀 Initializing Solar Inverter Control System...', 'info');
        
        this.setupEventListeners();
        this.chartManager.initializeCharts();
        this.websocketManager.connect();
        this.loadInitialData();
        
        this.logger.addLogEntry('✅ Application initialization completed', 'info');
    }

    setupEventListeners() {
        this.uiManager.setupEventListeners({
            onRetry: () => this.retryOperations(),
            onTimeRangeChange: (newRange) => this.handleTimeRangeChange(newRange),
            onDateChange: (newDate) => this.handleDateChange(newDate),
            onPageVisible: () => this.handlePageVisible()
        });
    }

    async loadInitialData() {
        const data = await this.apiClient.loadInitialData(this.selectedDate);
        
        if (data.status) {
            this.uiManager.updateControllerState(data.status);
        }
        
        if (data.metrics) {
            this.updateHistoricalCharts(data.metrics);
        }
        
        if (data.schedule) {
            this.scheduleManager.updateScheduleInfo(data.schedule);
            this.chartManager.updateScheduleCharts(data.schedule, data.metrics);
        }
    }

    handleWebSocketMessage(message) {
        switch (message.type) {
            case 'controller_state':
                this.uiManager.updateControllerState(message.data);
                break;
            case 'current_metrics':
                this.uiManager.updateCurrentMetrics(message.data);
                this.updateRealtimeChart(message.data);
                break;
            case 'live_update':
                this.uiManager.updateControllerState(message.data.controller);
                this.uiManager.updateCurrentMetrics(message.data.metrics);
                this.updateRealtimeChart(message.data.metrics);
                break;
            case 'historical_metrics':
                this.updateHistoricalCharts(message.data);
                break;
            case 'http_poll_trigger':
                // Triggered by HTTP polling fallback
                this.loadInitialData();
                break;
            default:
                // Message already logged by WebSocketManager
                break;
        }
    }

    handleTimeRangeChange(newRange) {
        const oldRange = this.currentTimeRange;
        this.currentTimeRange = newRange;
        this.logger.addLogEntry(`👤 User changed time range from ${oldRange}h to ${newRange}h`, 'info');
        
        this.updateChartsWithTimeRange(true);
    }

    async handleDateChange(newDate) {
        const oldDate = this.selectedDate;
        this.selectedDate = newDate;
        this.logger.addLogEntry(`👤 User changed date from ${oldDate} to ${newDate}`, 'info');
        
        // Load data for the new date
        await this.loadDataForDate(newDate);
    }

    async loadDataForDate(date) {
        this.logger.addLogEntry(`📅 Loading data for date: ${date}`, 'info');
        
        try {
            const isToday = date === new Date().toISOString().split('T')[0];
            
            // Load metrics for the selected date
            const metrics = await this.apiClient.loadMetricsData(isToday ? null : date, 24);
            if (metrics) {
                this.updateHistoricalCharts(metrics);
            }
            
            // Load schedule for the selected date
            const schedule = await this.apiClient.loadScheduleData(date);
            if (schedule) {
                this.scheduleManager.updateScheduleInfo(schedule);
                this.chartManager.updateScheduleCharts(schedule, metrics);
            }
            
            this.logger.addLogEntry(`✅ Data loaded successfully for ${date}`, 'info');
        } catch (error) {
            this.logger.addLogEntry(`❌ Failed to load data for ${date}: ${error.message}`, 'error');
        }
    }

    handlePageVisible() {
        if (this.websocketManager.getConnectionStatus() === 'disconnected') {
            this.websocketManager.connect();
        }
    }

    updateHistoricalCharts(metrics) {
        if (!Array.isArray(metrics) || metrics.length === 0) {
            this.logger.addLogEntry('⚠️ No historical metrics data received', 'warn');
            return;
        }

        this.logger.addLogEntry(`📊 Processing ${metrics.length} historical data points`, 'info');
        
        // Store all metrics data
        this.allMetricsData = metrics;

        // Log data range
        if (metrics.length > 0) {
            let timestampsOnly = metrics.map(m => m.timestamp);
            timestampsOnly.sort();
            const oldest = new Date(timestampsOnly[0] || Date.now() - 24 * 60 * 60 * 1000); // Default to 24h ago if no timestamp
            const newest = new Date(timestampsOnly[timestampsOnly.length - 1] || Date.now());
            this.logger.addLogEntry(`📅 Data range: ${oldest.toLocaleString()} to ${newest.toLocaleString()}`, 'info');
        }

        this.updateChartsWithTimeRange(true);
    }

    updateChartsWithTimeRange(force = false) {
        if (!this.allMetricsData || this.allMetricsData.length === 0) {
            this.logger.addLogEntry('⚠️ No metrics data available for chart update', 'warn');
            return;
        }

        // Throttle chart updates to avoid too frequent rendering
        if (!this.chartManager.shouldUpdateCharts() && !force) {
            return;
        }

        this.logger.addLogEntry(`📊 Updating charts for ${this.currentTimeRange}h time range`, 'info');

        // Filter data based on selected time range and date
        const selectedDateForFilter = this.selectedDate;
        const filteredMetrics = this.dataProcessor.filterMetricsByTimeRange(this.allMetricsData, this.currentTimeRange, selectedDateForFilter);
        this.logger.addLogEntry(`🔍 Filtered to ${filteredMetrics.length} data points for ${this.currentTimeRange}h range on ${this.selectedDate}`, 'info');
        
        // Limit data points to maximum for performance
        const limitedMetrics = this.dataProcessor.limitDataPoints(filteredMetrics, this.maxDataPoints);
        if (limitedMetrics.length !== filteredMetrics.length) {
            this.logger.addLogEntry(`⚡ Limited to ${limitedMetrics.length} points for performance`, 'info');
        }
        
        // Update charts with filtered and limited data
        this.chartManager.updateMetricsChart(limitedMetrics);
        let schedule = this.scheduleManager.getSchedule(selectedDateForFilter);
        this.chartManager.updateExpectedVsActualBatteryChargeChart(limitedMetrics, schedule);
        this.calculateAndDisplayCost(limitedMetrics);
        
        this.logger.addLogEntry('✅ Chart updates completed', 'info');
    }

    updateRealtimeChart(metrics) {
        // Add new real-time data to our stored metrics
        if (metrics && metrics.timestamp) {
            const newMetric = {
                timestamp: Date.now(),
                loadPower: metrics.loadPower || 0,
                gridPower: metrics.gridPower || 0,
                batteryPower: metrics.batteryPower || 0,
                batteryCharge: metrics.batteryCharge || 0,
                batteryCurrent: metrics.batteryCurrent || 0,
                batteryChargeRate: metrics.batteryChargeRate || 0,
                workModePriority: metrics.workModePriority || ''
            };

            this.logger.addLogEntry(`📊 Adding real-time data point to chart buffer`, 'info');

            // Add to our stored data
            this.allMetricsData.push(newMetric);

            // Keep only the last 24 hours of data
            const cutoffTime = Date.now() - (24 * 60 * 60 * 1000);
            const beforeCount = this.allMetricsData.length;
            this.allMetricsData = this.allMetricsData.filter(metric => metric.timestamp >= cutoffTime);
            const afterCount = this.allMetricsData.length;
            
            if (beforeCount !== afterCount) {
                this.logger.addLogEntry(`🗑️ Cleaned up ${beforeCount - afterCount} old data points (24h limit)`, 'info');
            }

            // Update charts with current time range (throttled)
            this.updateChartsWithTimeRange();
        } else {
            this.logger.addLogEntry('⚠️ Invalid real-time metrics data received', 'warn', metrics);
        }
    }

    calculateAndDisplayCost(metrics) {
        const totalCost = this.dataProcessor.calculateCost(metrics);
        this.uiManager.updateCostDisplay(totalCost);
        this.chartManager.updateCostChart(totalCost);
    }

    async retryOperations() {
        try {
            await this.apiClient.retryOperations();
            this.uiManager.showSuccess('Retry operation initiated successfully');
        } catch (error) {
            this.uiManager.showError(`Retry operation failed: ${error.message}`);
        }
    }

    // Cleanup method
    destroy() {
        this.logger.addLogEntry('🛑 Shutting down application...', 'info');
        
        this.scheduleManager.clearScheduleTimer();
        this.websocketManager.close();
        
        this.logger.addLogEntry('✅ Application shutdown completed', 'info');
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.solarApp = new SolarInverterApp();
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (window.solarApp) {
        window.solarApp.destroy();
    }
});
