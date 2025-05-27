// Chart manager for all chart-related functionality
class ChartManager {
    constructor(logger, dataProcessor) {
        this.logger = logger;
        this.dataProcessor = dataProcessor;
        this.charts = {};
        this.lastChartUpdate = 0;
        this.chartUpdateThrottle = 5000; // Minimum 5 seconds between chart updates
    }

    initializeCharts() {
        this.initializeRealtimeChart();
        this.initializeBatteryChargeChart();
        this.initializeCostChart();
        this.initializeScheduleCharts();
    }

    initializeRealtimeChart() {
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
    }

    initializeBatteryChargeChart() {
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
    }

    initializeCostChart() {
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

    initializeScheduleCharts() {
        this.initializeModeTimelineChart();
        this.initializeBatteryScheduleChart();
        this.initializeGridPricingChart();
        this.initializePowerFlowChart();
    }

    initializeModeTimelineChart() {
        const modeCtx = document.getElementById('mode-timeline-chart');
        if (modeCtx) {
            this.charts.modeTimeline = new Chart(modeCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Operating Mode',
                        data: [],
                        borderColor: '#9C27B0',
                        backgroundColor: 'rgba(156, 39, 176, 0.1)',
                        stepped: true,
                        pointRadius: 4,
                        pointHoverRadius: 6
                    }]
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
                            title: {
                                display: true,
                                text: 'Time'
                            }
                        },
                        y: {
                            min: 0.5,
                            max: 3.5,
                            ticks: {
                                stepSize: 1,
                                callback: function(value) {
                                    const modes = {
                                        1: 'Grid+Solar',
                                        2: 'Solar Only',
                                        3: 'Discharge'
                                    };
                                    return modes[value] || '';
                                }
                            },
                            title: {
                                display: true,
                                text: 'Mode'
                            }
                        }
                    },
                    plugins: {
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const modes = {
                                        1: 'Charge from Grid + Solar',
                                        2: 'Charge Solar Only',
                                        3: 'Discharge'
                                    };
                                    return modes[context.parsed.y] || 'Unknown Mode';
                                }
                            }
                        }
                    }
                }
            });
        }
    }

    initializeBatteryScheduleChart() {
        const batteryCtx = document.getElementById('battery-schedule-chart');
        if (batteryCtx) {
            this.charts.batterySchedule = new Chart(batteryCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Planned Battery Charge',
                        data: [],
                        borderColor: '#4CAF50',
                        backgroundColor: 'rgba(76, 175, 80, 0.2)',
                        fill: true,
                        tension: 0.4
                    }]
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
                            title: {
                                display: true,
                                text: 'Time'
                            }
                        },
                        y: {
                            beginAtZero: true,
                            max: 12,
                            title: {
                                display: true,
                                text: 'Battery Charge (kWh)'
                            }
                        }
                    }
                }
            });
        }
    }

    initializeGridPricingChart() {
        const pricingCtx = document.getElementById('grid-pricing-chart');
        if (pricingCtx) {
            this.charts.gridPricing = new Chart(pricingCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Grid Price',
                        data: [],
                        borderColor: '#FF5722',
                        backgroundColor: function(context) {
                            const value = context.parsed?.y;
                            if (value < 0.05) return 'rgba(76, 175, 80, 0.3)'; // Green for cheap
                            if (value < 0.10) return 'rgba(255, 193, 7, 0.3)'; // Yellow for medium
                            return 'rgba(244, 67, 54, 0.3)'; // Red for expensive
                        },
                        stepped: true,
                        pointRadius: 3
                    }]
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
                            title: {
                                display: true,
                                text: 'Time'
                            }
                        },
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Price (£/kWh)'
                            }
                        }
                    },
                    plugins: {
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return `Price: £${context.parsed.y.toFixed(4)}/kWh`;
                                }
                            }
                        }
                    }
                }
            });
        }
    }

    initializePowerFlowChart() {
        const powerFlowCtx = document.getElementById('power-flow-chart');
        if (powerFlowCtx) {
            this.charts.powerFlow = new Chart(powerFlowCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        {
                            label: 'Expected Load',
                            data: [],
                            borderColor: '#2196F3',
                            backgroundColor: 'rgba(33, 150, 243, 0.1)',
                            borderWidth: 2,
                            tension: 0.4
                        },
                        {
                            label: 'Expected Grid Usage',
                            data: [],
                            borderColor: '#F44336',
                            backgroundColor: 'rgba(244, 67, 54, 0.1)',
                            borderWidth: 2,
                            borderDash: [5, 5],
                            tension: 0.4
                        },
                        {
                            label: 'Expected Solar',
                            data: [],
                            borderColor: '#FF9800',
                            backgroundColor: 'rgba(255, 152, 0, 0.1)',
                            borderWidth: 2,
                            borderDash: [2, 2],
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
    }

    updateMetricsChart(metrics) {
        const chart = this.charts.realtime;
        if (!chart || !Array.isArray(metrics) || metrics.length === 0) {
            this.logger.addLogEntry('⚠️ Cannot update metrics chart - invalid data or chart not found', 'warn');
            return;
        }

        this.logger.addLogEntry(`📊 Updating metrics chart with ${metrics.length} data points`, 'info');

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
        this.logger.addLogEntry('✅ Metrics chart updated successfully', 'info');
    }

    updateExpectedVsActualBatteryChargeChart(metrics, schedule) {
        const chart = this.charts.batteryCharge;
        if (!chart || !Array.isArray(metrics) || metrics.length === 0) {
            this.logger.addLogEntry('⚠️ Cannot update control chart - invalid data or chart not found', 'warn');
            return;
        }

        this.logger.addLogEntry(`📊 Updating control chart with ${metrics.length} data points`, 'info');

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
                const expectedBatteryLevel = this.dataProcessor.getExpectedBatteryLevel(timestamp, schedule);
                chart.data.datasets[0].data.push(expectedBatteryLevel);
                if (expectedBatteryLevel !== null) expectedPoints++;
            }
        });

        chart.update('active');
        this.logger.addLogEntry(`✅ Control chart updated - Expected: ${expectedPoints} points, Actual: ${actualPoints} points`, 'info');
    }

    updateCostChart(cost) {
        const chart = this.charts.cost;
        if (!chart) return;

        // Update the chart data
        chart.data.datasets[0].data[0] = cost;
        chart.update('active');
    }

    updateScheduleCharts(scheduleData) {
        if (!Array.isArray(scheduleData) || scheduleData.length === 0) {
            this.logger.addLogEntry('⚠️ No schedule data available for charts', 'warn');
            return;
        }

        // Process data for each chart
        const modeData = this.dataProcessor.processModeTimelineData(scheduleData);
        const batteryData = this.dataProcessor.processBatteryScheduleData(scheduleData);
        const pricingData = this.dataProcessor.processGridPricingData(scheduleData);
        const powerFlowData = this.dataProcessor.processPowerFlowData(scheduleData);

        // Update charts
        this.updateModeTimelineChart(modeData);
        this.updateBatteryScheduleChart(batteryData);
        this.updateGridPricingChart(pricingData);
        this.updatePowerFlowChart(powerFlowData);

        this.logger.addLogEntry('✅ Schedule charts updated', 'info');
    }

    updateModeTimelineChart(data) {
        const chart = this.charts.modeTimeline;
        if (!chart || !data) return;

        chart.data.datasets[0].data = data;
        chart.update('none');
    }

    updateBatteryScheduleChart(data) {
        const chart = this.charts.batterySchedule;
        if (!chart || !data) return;

        chart.data.datasets[0].data = data;
        chart.update('none');
    }

    updateGridPricingChart(data) {
        const chart = this.charts.gridPricing;
        if (!chart || !data) return;

        chart.data.datasets[0].data = data;
        chart.update('none');
    }

    updatePowerFlowChart(data) {
        const chart = this.charts.powerFlow;
        if (!chart || !data) return;

        chart.data.datasets[0].data = data.load;
        chart.data.datasets[1].data = data.grid;
        chart.data.datasets[2].data = data.solar;
        chart.update('none');
    }

    shouldUpdateCharts() {
        const now = Date.now();
        if (now - this.lastChartUpdate < this.chartUpdateThrottle) {
            return false;
        }
        this.lastChartUpdate = now;
        return true;
    }

    getCharts() {
        return this.charts;
    }
}