// Solar Inverter Control System Frontend
class SolarInverterApp {
    constructor() {
        this.ws = null;
        this.charts = {};
        this.connectionStatus = 'disconnected';
        this.logEntries = [];
        this.maxLogEntries = 100;
        this.lastCostCalculation = 0;
        this.allMetricsData = []; // Store all 24 hours of data
        this.currentTimeRange = 4; // Default to 4 hours
        this.lastChartUpdate = 0; // Track last chart update time
        this.chartUpdateThrottle = 5000; // Minimum 5 seconds between chart updates
        this.maxDataPoints = 100; // Maximum data points per chart
        
        this.scheduleUpdateTimer = null;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.initializeCharts();
        this.connectWebSocket();
        this.loadInitialData();
        
        // Update connection status indicator
        this.updateConnectionStatus();
    }

    setupEventListeners() {
        // Retry button
        const retryButton = document.getElementById('retry-button');
        if (retryButton) {
            retryButton.addEventListener('click', () => {
                this.addLogEntry('👤 User clicked retry button', 'info');
                this.retryOperations();
            });
        }

        // Time range selector
        const timeRangeSelect = document.getElementById('time-range-select');
        if (timeRangeSelect) {
            timeRangeSelect.addEventListener('change', (e) => {
                const newRange = parseInt(e.target.value);
                this.addLogEntry(`👤 User changed time range from ${this.currentTimeRange}h to ${newRange}h`, 'info');
                this.currentTimeRange = newRange;
                // Force immediate update when user changes time range
                this.lastChartUpdate = 0;
                this.updateChartsWithTimeRange();
            });
        }

        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.connectionStatus === 'disconnected') {
                this.connectWebSocket();
            }
        });
    }

    connectWebSocket() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            return;
        }

        this.connectionStatus = 'connecting';
        this.updateConnectionStatus();

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log('WebSocket connected');
                this.connectionStatus = 'connected';
                this.updateConnectionStatus();
                this.addLogEntry('🔌 WebSocket connected successfully', 'info');
            };

            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleWebSocketMessage(message);
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error);
                }
            };

            this.ws.onclose = () => {
                console.log('WebSocket disconnected');
                this.connectionStatus = 'disconnected';
                this.updateConnectionStatus();
                this.addLogEntry('🔌 WebSocket disconnected - attempting reconnect in 5s', 'warn');
                
                // Attempt to reconnect after 5 seconds
                setTimeout(() => {
                    if (this.connectionStatus === 'disconnected') {
                        this.addLogEntry('🔄 Attempting WebSocket reconnection...', 'info');
                        this.connectWebSocket();
                    }
                }, 5000);
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.connectionStatus = 'disconnected';
                this.updateConnectionStatus();
                this.addLogEntry('❌ WebSocket error occurred - connection failed', 'error');
            };

        } catch (error) {
            console.error('Failed to create WebSocket connection:', error);
            this.connectionStatus = 'disconnected';
            this.updateConnectionStatus();
            this.addLogEntry(`❌ WebSocket creation failed: ${error.message}`, 'error');
            
            // Fallback to HTTP polling
            this.addLogEntry('🔄 Falling back to HTTP polling mode', 'warn');
            this.startHttpPolling();
        }
    }

    handleWebSocketMessage(message) {
        switch (message.type) {
            case 'controller_state':
                this.addLogEntry(`📊 Controller state update - Status: ${message.data.status}`, 'info');
                this.updateControllerState(message.data);
                break;
            case 'current_metrics':
                this.addLogEntry(`📈 Current metrics update - Load: ${((message.data.loadPower || 0) / 1000).toFixed(2)}kW, Grid: ${((message.data.gridPower || 0) / 1000).toFixed(2)}kW`, 'info');
                this.updateCurrentMetrics(message.data);
                break;
            case 'live_update':
                this.addLogEntry(`🔄 Live update received - Controller & Metrics`, 'info');
                this.updateControllerState(message.data.controller);
                this.updateCurrentMetrics(message.data.metrics);
                break;
            case 'historical_metrics':
                this.addLogEntry(`📊 Historical metrics received - ${Array.isArray(message.data) ? message.data.length : 0} data points`, 'info');
                this.updateHistoricalCharts(message.data);
                break;
            case 'log_message':
                this.addLogEntry(`🌐 ${message.data.message}`, message.data.level);
                break;
            case 'control_action':
                this.addLogEntry(`⚡ Control action: ${message.data.actionType} = ${message.data.targetValue}`, 'info');
                break;
            case 'error':
                this.addLogEntry(`❌ Server error: ${message.data.message}`, 'error');
                break;
            default:
                this.addLogEntry(`⚠️ Unknown message type: ${message.type}`, 'warn');
                break;
        }
    }

    async loadInitialData() {
        this.addLogEntry('🔄 Loading initial data from server...', 'info');
        try {
            // Load current status
            this.addLogEntry('🌐 Fetching current system status...', 'info');
            const statusResponse = await fetch('/api/status');
            if (statusResponse.ok) {
                const status = await statusResponse.json();
                this.addLogEntry(`✅ Status loaded - Mode: ${status.actualWorkMode || 'Unknown'}`, 'info');
                this.updateControllerState(status);
            } else {
                this.addLogEntry(`⚠️ Status fetch failed - HTTP ${statusResponse.status}`, 'warn');
            }

            // Load recent metrics
            this.addLogEntry('🌐 Fetching 24h metrics data...', 'info');
            const metricsResponse = await fetch('/api/metrics?hours=24');
            if (metricsResponse.ok) {
                const metrics = await metricsResponse.json();
                this.addLogEntry(`✅ Metrics loaded - ${Array.isArray(metrics) ? metrics.length : 0} data points`, 'info');
                this.updateHistoricalCharts(metrics);
            } else {
                this.addLogEntry(`⚠️ Metrics fetch failed - HTTP ${metricsResponse.status}`, 'warn');
            }

            // Load schedule
            this.addLogEntry('🌐 Fetching schedule data...', 'info');
            const scheduleResponse = await fetch('/api/schedule');
            if (scheduleResponse.ok) {
                const schedule = await scheduleResponse.json();
                this.addLogEntry(`✅ Schedule loaded - ${Array.isArray(schedule) ? schedule.length : 0} blocks`, 'info');
                this.updateScheduleInfo(schedule);
            } else {
                this.addLogEntry(`⚠️ Schedule fetch failed - HTTP ${scheduleResponse.status}`, 'warn');
            }

            this.addLogEntry('✅ Initial data loading completed', 'info');
        } catch (error) {
            console.error('Error loading initial data:', error);
            this.addLogEntry(`❌ Failed to load initial data: ${error.message}`, 'error');
        }
    }

    startHttpPolling() {
        this.addLogEntry('⏱️ Starting HTTP polling fallback (30s intervals)', 'info');
        // Fallback polling every 30 seconds when WebSocket is not available
        setInterval(() => {
            if (this.connectionStatus === 'disconnected') {
                this.addLogEntry('🔄 HTTP polling - fetching latest data...', 'info');
                this.loadInitialData();
            }
        }, 30000);
    }

    updateConnectionStatus() {
        // Create or update connection status indicator
        let statusEl = document.querySelector('.connection-status');
        if (!statusEl) {
            statusEl = document.createElement('div');
            statusEl.className = 'connection-status';
            document.body.appendChild(statusEl);
        }

        statusEl.className = `connection-status ${this.connectionStatus}`;
        
        switch (this.connectionStatus) {
            case 'connected':
                statusEl.textContent = '● Connected';
                break;
            case 'connecting':
                statusEl.textContent = '● Connecting...';
                break;
            case 'disconnected':
                statusEl.textContent = '● Disconnected';
                break;
        }
    }

    updateControllerState(state) {
        this.addLogEntry(`🔄 Updating controller state - Status: ${state.status}, Mode: ${state.actualWorkMode || 'Unknown'}`, 'info');
        
        // Update status indicator
        const statusIndicator = document.getElementById('status-indicator');
        const statusTitle = document.getElementById('status-title');
        const statusMessage = document.getElementById('status-message');
        
        if (statusIndicator && statusTitle && statusMessage) {
            statusIndicator.className = `status-indicator status-${state.status}`;
            statusTitle.textContent = this.getStatusTitle(state.status);
            statusMessage.textContent = state.message || 'No message';
            
            if (state.status === 'red') {
                this.addLogEntry('⚠️ System status is RED - manual intervention may be required', 'warn');
            }
        }

        // Update current settings
        this.updateElement('current-work-mode', state.actualWorkMode || '-');
        this.updateElement('current-charge-rate',
            state.actualChargeRate !== undefined ? `${state.actualChargeRate}%` : '-');
        this.updateElement('desired-work-mode', state.desiredWorkMode || '-');
        this.updateElement('desired-charge-rate',
            state.desiredChargeRate !== undefined ? `${state.desiredChargeRate}%` : '-');

        // Log any discrepancies between desired and actual values
        if (state.actualWorkMode && state.desiredWorkMode && state.actualWorkMode !== state.desiredWorkMode) {
            this.addLogEntry(`⚠️ Work mode mismatch - Desired: ${state.desiredWorkMode}, Actual: ${state.actualWorkMode}`, 'warn');
        }

        // Show/hide retry button
        const retrySection = document.getElementById('retry-section');
        if (retrySection) {
            retrySection.style.display = state.status === 'red' ? 'block' : 'none';
        }
    }

    updateCurrentMetrics(metrics) {
        const loadKw = ((metrics.loadPower || 0) / 1000).toFixed(2);
        const gridKw = ((metrics.gridPower || 0) / 1000).toFixed(2);
        const batteryKw = ((metrics.batteryPower || 0) / 1000).toFixed(2);
        const batteryCurrent = (metrics.batteryCurrent || 0).toFixed(1);
        const remainingBatteryKwh = (metrics.remainingBatteryKwh || 0).toFixed(2);
        
        this.addLogEntry(`📈 Metrics update - Load: ${loadKw}kW, Grid: ${gridKw}kW, Battery: ${batteryKw}kW, Current: ${batteryCurrent}A, Remaining: ${remainingBatteryKwh}kWh`, 'info');
        
        // Convert watts to kilowatts for display
        this.updateElement('load-power', `${loadKw} kW`);
        this.updateElement('grid-power', `${gridKw} kW`);
        this.updateElement('battery-power', `${batteryKw} kW`);
        this.updateElement('battery-current', `${batteryCurrent} A`);
        this.updateElement('remaining-battery', `${remainingBatteryKwh} kWh`);

        // Update next schedule information
        if (metrics.nextScheduleInfo) {
            this.updateElement('next-start-time', metrics.nextScheduleInfo.startTime || '-');
            this.updateElement('next-mode', this.formatMode(metrics.nextScheduleInfo.mode) || '-');
            this.updateElement('next-time-until', metrics.nextScheduleInfo.timeUntil || '-');
            this.updateElement('next-start-charge', `${metrics.nextScheduleInfo.expectedStartChargeKwh.toFixed(2)} kWh`);
        }

        // Log significant power events
        if (Math.abs(metrics.gridPower || 0) > 5000) { // > 5kW
            this.addLogEntry(`⚡ High grid power detected: ${gridKw}kW`, 'warn');
        }
        if (Math.abs(metrics.batteryPower || 0) > 3000) { // > 3kW
            this.addLogEntry(`🔋 High battery power detected: ${batteryKw}kW`, 'info');
        }

        // Update real-time chart
        this.updateRealtimeChart(metrics);
    }

    updateHistoricalCharts(metrics) {
        if (!Array.isArray(metrics) || metrics.length === 0) {
            this.addLogEntry('⚠️ No historical metrics data received', 'warn');
            return;
        }

        this.addLogEntry(`📊 Processing ${metrics.length} historical data points`, 'info');
        
        // Store all metrics data
        this.allMetricsData = metrics;
        
        // Log data range
        if (metrics.length > 0) {
            const oldest = new Date(Math.min(...metrics.map(m => m.timestamp)));
            const newest = new Date(Math.max(...metrics.map(m => m.timestamp)));
            this.addLogEntry(`📅 Data range: ${oldest.toLocaleString()} to ${newest.toLocaleString()}`, 'info');
        }
        
        // Update charts with filtered data based on current time range
        this.updateChartsWithTimeRange();
    }

    updateChartsWithTimeRange() {
        if (!this.allMetricsData || this.allMetricsData.length === 0) {
            this.addLogEntry('⚠️ No metrics data available for chart update', 'warn');
            return;
        }

        // Throttle chart updates to avoid too frequent rendering
        const now = Date.now();
        if (now - this.lastChartUpdate < this.chartUpdateThrottle) {
            return;
        }
        this.lastChartUpdate = now;

        this.addLogEntry(`📊 Updating charts for ${this.currentTimeRange}h time range`, 'info');

        // Filter data based on selected time range
        const filteredMetrics = this.filterMetricsByTimeRange(this.allMetricsData, this.currentTimeRange);
        this.addLogEntry(`🔍 Filtered to ${filteredMetrics.length} data points for ${this.currentTimeRange}h range`, 'info');
        
        // Limit data points to maximum for performance
        const limitedMetrics = this.limitDataPoints(filteredMetrics, this.maxDataPoints);
        if (limitedMetrics.length !== filteredMetrics.length) {
            this.addLogEntry(`⚡ Limited to ${limitedMetrics.length} points for performance`, 'info');
        }
        
        // Update charts with filtered and limited data
        this.updateMetricsChart(limitedMetrics);
        this.updateExpectedVsActualBatteryChargeChart(limitedMetrics);
        this.calculateAndDisplayCost(limitedMetrics);
        
        this.addLogEntry('✅ Chart updates completed', 'info');
    }

    filterMetricsByTimeRange(metrics, hours) {
        if (!Array.isArray(metrics) || metrics.length === 0) {
            return [];
        }

        const now = Date.now();
        const cutoffTime = now - (hours * 60 * 60 * 1000); // Convert hours to milliseconds
        
        return metrics.filter(metric => metric.timestamp >= cutoffTime);
    }

    limitDataPoints(metrics, maxPoints) {
        if (!Array.isArray(metrics) || metrics.length <= maxPoints) {
            return metrics;
        }

        // Calculate step size to evenly distribute data points
        const step = Math.ceil(metrics.length / maxPoints);
        const limitedMetrics = [];
        
        for (let i = 0; i < metrics.length; i += step) {
            limitedMetrics.push(metrics[i]);
        }
        
        // Always include the last data point
        if (limitedMetrics[limitedMetrics.length - 1] !== metrics[metrics.length - 1]) {
            limitedMetrics.push(metrics[metrics.length - 1]);
        }
        
        return limitedMetrics;
    }

    updateScheduleInfo(schedule) {
        // Store schedule for cost calculations
        this.schedule = schedule;
        
        // Update next schedule block info
        this.updateNextScheduleBlock(schedule);
        
        // Start timer to update "Time until" every minute
        this.startScheduleUpdateTimer();
    }

    startScheduleUpdateTimer() {
        // Clear existing timer
        if (this.scheduleUpdateTimer) {
            clearInterval(this.scheduleUpdateTimer);
        }
        
        // Update every minute
        this.scheduleUpdateTimer = setInterval(() => {
            if (this.schedule) {
                this.updateNextScheduleBlock(this.schedule);
            }
        }, 60000); // 60 seconds
    }

    updateNextScheduleBlock(schedule) {
        if (!Array.isArray(schedule) || schedule.length === 0) {
            this.updateElement('next-start-time', '-');
            this.updateElement('next-mode', '-');
            this.updateElement('next-time-until', '-');
            this.updateElement('next-usage', '-');
            return;
        }

        const now = new Date();
        const currentTime = now.toTimeString().slice(0, 8); // HH:MM:SS format
        
        // Find the next schedule block
        let nextBlock = null;
        let isNextDay = false;
        
        for (const block of schedule) {
            if (block.time && block.time.hourStart > currentTime) {
                nextBlock = block;
                break;
            }
        }
        
        // If no block found for today, use the first block (next day)
        if (!nextBlock && schedule.length > 0) {
            nextBlock = schedule[0];
            isNextDay = true;
        }
        
        if (nextBlock) {
            // Format start time
            const startTime = nextBlock.time.hourStart;
            
            // Calculate time until next block starts
            const startParts = startTime.split(':').map(Number);
            const currentParts = currentTime.split(':').map(Number);
            
            const startMinutes = startParts[0] * 60 + startParts[1];
            const currentMinutes = currentParts[0] * 60 + currentParts[1];
            
            let minutesUntil;
            if (isNextDay) {
                // Next day calculation: minutes until midnight + minutes from midnight to start
                minutesUntil = (24 * 60 - currentMinutes) + startMinutes;
            } else {
                minutesUntil = startMinutes - currentMinutes;
            }
            
            const hoursUntil = Math.floor(minutesUntil / 60);
            const remainingMinutes = minutesUntil % 60;
            
            let timeUntil;
            if (hoursUntil > 0) {
                timeUntil = `${hoursUntil}h ${remainingMinutes}m`;
            } else {
                timeUntil = `${remainingMinutes}m`;
            }
            
            // Format mode name
            const mode = this.formatModeName(nextBlock.mode);
            
            // Format expected usage
            const usage = nextBlock.expectedConsumption
                ? `${nextBlock.expectedConsumption.toFixed(2)} kWh`
                : '-';
            
            this.updateElement('next-start-time', startTime);
            this.updateElement('next-mode', mode);
            this.updateElement('next-time-until', timeUntil);
            this.updateElement('next-usage', usage);
        } else {
            this.updateElement('next-start-time', '-');
            this.updateElement('next-mode', '-');
            this.updateElement('next-time-until', '-');
            this.updateElement('next-usage', '-');
        }
    }

    formatModeName(mode) {
        switch (mode) {
            case 'ChargeSolarOnly':
                return 'Charge Solar Only';
            case 'ChargeFromGridAndSolar':
                return 'Charge Grid + Solar';
            case 'Discharge':
                return 'Discharge';
            default:
                return mode || '-';
        }
    }

    getStatusTitle(status) {
        switch (status) {
            case 'green':
                return 'System Operating Normally';
            case 'amber':
                return 'System Updating';
            case 'red':
                return 'System Suspended';
            default:
                return 'System Status';
        }
    }

    updateElement(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }

    initializeCharts() {
        // Real-time metrics chart
        const realtimeCtx = document.getElementById('realtime-chart');
        if (realtimeCtx) {
            this.charts.realtime = new Chart(realtimeCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        {
                            label: 'Load Power (kW)',
                            data: [],
                            borderColor: '#FF6384',
                            backgroundColor: 'rgba(255, 99, 132, 0.1)',
                            tension: 0.4
                        },
                        {
                            label: 'Grid Power (kW)',
                            data: [],
                            borderColor: '#36A2EB',
                            backgroundColor: 'rgba(54, 162, 235, 0.1)',
                            tension: 0.4
                        },
                        {
                            label: 'Battery Power (kW)',
                            data: [],
                            borderColor: '#4BC0C0',
                            backgroundColor: 'rgba(75, 192, 192, 0.1)',
                            tension: 0.4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            type: 'time',
                            time: {
                                unit: 'hour',
                                displayFormats: {
                                    hour: 'HH:mm'
                                }
                            },
                            display: true,
                            title: {
                                display: true,
                                text: 'Time'
                            }
                        },
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Power (kW)'
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top'
                        }
                    }
                }
            });
        }

        // Control parameters chart
        const controlCtx = document.getElementById('charge-chart');
        if (controlCtx) {
            this.charts.batteryCharge = new Chart(controlCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        {
                            label: 'Expected Battery Level (kWh)',
                            data: [],
                            borderColor: '#FF9F40',
                            backgroundColor: 'rgba(255, 159, 64, 0.1)',
                            tension: 0.4
                        },
                        {
                            label: 'Actual Battery Level (kWh)',
                            data: [],
                            borderColor: '#FF6384',
                            backgroundColor: 'rgba(255, 99, 132, 0.1)',
                            tension: 0.4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            type: 'time',
                            time: {
                                unit: 'hour'
                            }
                        },
                        y: {
                            beginAtZero: true,
                            max: 12,
                            title: {
                                display: true,
                                text: 'Battery Level %'
                            }
                        }
                    }
                }
            });
        }

        // Cost chart
        const costCtx = document.getElementById('cost-chart');
        if (costCtx) {
            this.charts.cost = new Chart(costCtx, {
                type: 'bar',
                data: {
                    labels: ['Today'],
                    datasets: [{
                        label: 'Grid Cost (£)',
                        data: [0],
                        backgroundColor: '#4CAF50',
                        borderColor: '#45a049',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: false,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            min: 0,
                            max: 50,
                            title: {
                                display: true,
                                text: 'Cost (£)'
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            display: false
                        }
                    }
                }
            });
        }
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

            this.addLogEntry(`📊 Adding real-time data point to chart buffer`, 'info');

            // Add to our stored data
            this.allMetricsData.push(newMetric);

            // Keep only the last 24 hours of data
            const cutoffTime = Date.now() - (24 * 60 * 60 * 1000);
            const beforeCount = this.allMetricsData.length;
            this.allMetricsData = this.allMetricsData.filter(metric => metric.timestamp >= cutoffTime);
            const afterCount = this.allMetricsData.length;
            
            if (beforeCount !== afterCount) {
                this.addLogEntry(`🗑️ Cleaned up ${beforeCount - afterCount} old data points (24h limit)`, 'info');
            }

            // Update charts with current time range (throttled)
            this.updateChartsWithTimeRange();
        } else {
            this.addLogEntry('⚠️ Invalid real-time metrics data received', 'warn', metrics);
        }
    }

    updateMetricsChart(metrics) {
        const chart = this.charts.realtime;
        if (!chart || !Array.isArray(metrics) || metrics.length === 0) {
            this.addLogEntry('⚠️ Cannot update metrics chart - invalid data or chart not found', 'warn');
            return;
        }

        this.addLogEntry(`📊 Updating metrics chart with ${metrics.length} data points`, 'info');

        // Clear existing data
        chart.data.labels = [];
        chart.data.datasets[0].data = [];
        chart.data.datasets[1].data = [];
        chart.data.datasets[2].data = [];

        // Sort metrics by timestamp
        const sortedMetrics = metrics.sort((a, b) => a.timestamp - b.timestamp);

        // Process metrics to extract power data
        sortedMetrics.forEach(metric => {
            if (metric.timestamp) {
                const timestamp = new Date(metric.timestamp);
                chart.data.labels.push(timestamp);
                
                // Add power data (convert watts to kilowatts)
                chart.data.datasets[0].data.push((metric.loadPower || 0) / 1000);
                chart.data.datasets[1].data.push((metric.gridPower || 0) / 1000);
                chart.data.datasets[2].data.push((metric.batteryPower || 0) / 1000);
            }
        });

        chart.update('active');
        this.addLogEntry('✅ Metrics chart updated successfully', 'info');
    }

    updateExpectedVsActualBatteryChargeChart(metrics) {
        const chart = this.charts.batteryCharge;
        if (!chart || !Array.isArray(metrics) || metrics.length === 0) {
            this.addLogEntry('⚠️ Cannot update control chart - invalid data or chart not found', 'warn');
            return;
        }

        this.addLogEntry(`📊 Updating control chart with ${metrics.length} data points`, 'info');

        // Clear existing data
        chart.data.labels = [];
        chart.data.datasets[0].data = [];
        chart.data.datasets[1].data = [];

        let expectedPoints = 0;
        let actualPoints = 0;

        // Process metrics to extract battery level data
        metrics.forEach(metric => {
            if (metric.timestamp) {
                const timestamp = new Date(metric.timestamp);
                chart.data.labels.push(timestamp);
                
                // Add actual battery charge (from MQTT data)
                const actualBatteryLevel = metric.batteryCharge !== undefined ? metric.batteryCharge : null;

                if(actualBatteryLevel === null) {
                    console.warn('⚠️ No actual battery level data available', metric);
                }
                let BATTERY_MAX_CHARGE = 10;
                const batteryRemainingKwh = actualBatteryLevel / 100 * BATTERY_MAX_CHARGE; // Convert percentage to kWh (assuming 10kWh battery)
                chart.data.datasets[1].data.push(batteryRemainingKwh);
                if (actualBatteryLevel !== null) actualPoints++;
                
                // Get expected battery level from schedule
                const expectedBatteryLevel = this.getExpectedBatteryLevel(timestamp);
                chart.data.datasets[0].data.push(expectedBatteryLevel);
                if (expectedBatteryLevel !== null) expectedPoints++;
            }
        });

        chart.update('active');
        this.addLogEntry(`✅ Control chart updated - Expected: ${expectedPoints} points, Actual: ${actualPoints} points`, 'info');
    }

    getExpectedBatteryLevel(timestamp) {
        if (!this.schedule || !Array.isArray(this.schedule)) {
            return null;
        }

        const time = new Date(timestamp);
        const timeString = time.toTimeString().slice(0, 8); // HH:MM:SS format
        
        // Find the schedule block that contains this time
        for (const block of this.schedule) {
            if (timeString >= block.time.hourStart && timeString < block.time.hourEnd) {
                // Interpolate between start and end battery levels
                const startLevel = block.startBatteryChargeKwh || 0;
                const endLevel = block.endBatteryChargeKwh || 0;

                // Calculate progress through the time segment
                const segmentStart = this.parseTimeString(block.time.hourStart);
                const segmentEnd = this.parseTimeString(block.time.hourEnd);
                const currentTime = this.parseTimeString(timeString);

                const segmentDuration = segmentEnd - segmentStart;
                const elapsed = currentTime - segmentStart;
                const progress = segmentDuration > 0 ? elapsed / segmentDuration : 0;

                // Linear interpolation between start and end levels
                const interpolatedLevel = startLevel + (endLevel - startLevel) * progress;
                return Math.max(0, Math.min(10, interpolatedLevel));
            }
        }

        console.warn('Unable to find expected battery level for time:', timestamp);
        return null;
    }

    parseTimeString(timeStr) {
        // Convert HH:MM:SS to minutes since midnight
        const parts = timeStr.split(':').map(Number);
        return parts[0] * 60 + parts[1] + parts[2] / 60;
    }

    calculateAndDisplayCost(metrics) {
        // Simple cost calculation - just show a reasonable daily estimate
        let totalCost = 0;
        
        if (Array.isArray(metrics) && metrics.length > 0) {
            // Get the most recent metric for current power usage
            const latestMetric = metrics[metrics.length - 1] || metrics[0];
            
            if (latestMetric) {
                // Convert watts to kilowatts
                const currentGridUsageKw = Math.max(0, (latestMetric.gridPower || 0) / 1000);
                const avgPrice = 0.25; // £0.25 per kWh
                
                // Estimate daily cost based on current usage
                // Assume current usage continues for 24 hours
                totalCost = currentGridUsageKw * 24 * avgPrice;
                
                // Cap at reasonable maximum
                totalCost = Math.min(totalCost, 50.00);
            }
        }

        this.updateElement('total-cost', `£${totalCost.toFixed(2)}`);
        
        // Update the cost chart
        this.updateCostChart(totalCost);
    }

    updateCostChart(cost) {
        const chart = this.charts.cost;
        if (!chart) return;

        // Update the chart data
        //chart.data.datasets[0].data[0] = cost;
        chart.update('active');
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
        if (this.logEntries.length > this.maxLogEntries) {
            this.logEntries = this.logEntries.slice(0, this.maxLogEntries);
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

    async retryOperations() {
        this.addLogEntry('🔄 Initiating retry operations...', 'info');
        try {
            const response = await fetch('/api/retry', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const result = await response.json();
                this.addLogEntry('✅ Retry operation initiated successfully', 'info');
            } else {
                this.addLogEntry(`❌ Retry failed - HTTP ${response.status}`, 'error');
                throw new Error('Failed to retry operations');
            }
        } catch (error) {
            console.error('Error retrying operations:', error);
            this.addLogEntry(`❌ Retry operation failed: ${error.message}`, 'error');
        }
    }

    sendWebSocketMessage(type, data = {}) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const message = {
                type,
                data,
                timestamp: Date.now()
            };
            this.ws.send(JSON.stringify(message));
        }
    }

    formatMode(mode) {
        switch (mode) {
            case 'ChargeFromGridAndSolar':
                return 'Charge (Grid + Solar)';
            case 'ChargeSolarOnly':
                return 'Charge (Solar Only)';
            case 'Discharge':
                return 'Discharge';
            default:
                return mode;
        }
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.solarApp = new SolarInverterApp();
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (window.solarApp && window.solarApp.ws) {
        window.solarApp.ws.close();
    }
});
