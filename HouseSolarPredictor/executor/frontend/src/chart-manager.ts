import {
    Chart,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    LineController,
    BarController,
    BarElement,
    Title,
    Tooltip,
    Legend,
    TimeScale,
    ChartOptions,
    ChartType, ChartTypeRegistry
} from 'chart.js';
import 'chartjs-adapter-date-fns';

import { Logger } from './logger';
import { DataProcessor } from './data-processor';
import { ChartDataPoint } from './types';
import {MetricInstance} from "@shared";
import {Schedule} from "@shared/definitions/schedule";

// Register Chart.js components
Chart.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    LineController,
    BarController,
    BarElement,
    Title,
    Tooltip,
    Legend,
    TimeScale
);

export class ChartManager {
    private readonly logger: Logger;
    private readonly dataProcessor: DataProcessor;
    private charts: Map<string, Chart<keyof ChartTypeRegistry, ChartDataPoint[], unknown>> = new Map();
    private lastUpdateTime: number = 0;
    private readonly updateThrottleMs: number = 1000; // 1 second throttle

    constructor(logger: Logger, dataProcessor: DataProcessor) {
        this.logger = logger;
        this.dataProcessor = dataProcessor;
    }

    initializeCharts(): void {
        this.logger.addLogEntry('📊 Initializing Chart.js charts...', 'info');
        
        try {
            this.initializeRealtimeChart();
            this.initializeChargeChart();
            this.initializeCostChart();
            this.initializeModeTimelineChart();
            this.initializeBatteryScheduleChart();
            this.initializeGridPricingChart();
            this.initializePowerFlowChart();
            
            this.logger.addLogEntry('✅ All charts initialized successfully', 'info');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.addLogEntry(`❌ Chart initialization failed: ${errorMessage}`, 'error');
        }
    }

    private initializeRealtimeChart(): void {
        const canvas = document.getElementById('realtime-chart') as HTMLCanvasElement;
        if (!canvas) return;

        const config = {
            type: 'line' as ChartType,
            data: {
                datasets: [
                    {
                        label: 'Load Power (kW)',
                        data: [] as ChartDataPoint[],
                        borderColor: 'rgb(255, 99, 132)',
                        backgroundColor: 'rgba(255, 99, 132, 0.2)',
                        tension: 0.1
                    },
                    {
                        label: 'Grid Power (kW)',
                        data: [] as ChartDataPoint[],
                        borderColor: 'rgb(54, 162, 235)',
                        backgroundColor: 'rgba(54, 162, 235, 0.2)',
                        tension: 0.1
                    },
                    {
                        label: 'Battery Power (kW)',
                        data: [] as ChartDataPoint[],
                        borderColor: 'rgb(255, 205, 86)',
                        backgroundColor: 'rgba(255, 205, 86, 0.2)',
                        tension: 0.1
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
                            displayFormats: {
                                minute: 'HH:mm',
                                hour: 'HH:mm'
                            }
                        },
                        title: {
                            display: true,
                            text: 'Time'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Power (kW)'
                        }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Real-time Power Metrics'
                    },
                    legend: {
                        display: true,
                        position: 'top'
                    }
                }
            } as ChartOptions
        };

        const chart = new Chart(canvas, config);
        this.charts.set('realtime', chart);
    }

    private initializeChargeChart(): void {
        const canvas = document.getElementById('charge-chart') as HTMLCanvasElement;
        if (!canvas) return;

        const config = {
            type: 'line' as ChartType,
            data: {
                datasets: [
                    {
                        label: 'Expected Battery Level (kWh)',
                        data: [] as ChartDataPoint[],
                        borderColor: 'rgb(75, 192, 192)',
                        backgroundColor: 'rgba(75, 192, 192, 0.2)',
                        borderDash: [5, 5],
                        tension: 0.1
                    },
                    {
                        label: 'Actual Battery Level (kWh)',
                        data: [] as ChartDataPoint[],
                        borderColor: 'rgb(153, 102, 255)',
                        backgroundColor: 'rgba(153, 102, 255, 0.2)',
                        tension: 0.1
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
                            displayFormats: {
                                minute: 'HH:mm',
                                hour: 'HH:mm'
                            }
                        },
                        title: {
                            display: true,
                            text: 'Time'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Battery Level (kWh)'
                        },
                        min: 0,
                        max: 12
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Expected vs Actual Battery Charge'
                    }
                }
            } as ChartOptions
        };

        const chart = new Chart(canvas, config);
        this.charts.set('charge', chart);
    }

    private initializeCostChart(): void {
        const canvas = document.getElementById('cost-chart') as HTMLCanvasElement;
        if (!canvas) return;

        const config = {
            type: 'bar' as ChartType,
            data: {
                labels: [],
                datasets: [{
                    label: 'Grid Usage Cost (£)',
                    data: [],
                    backgroundColor: 'rgba(255, 159, 64, 0.6)',
                    borderColor: 'rgba(255, 159, 64, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Cost (£)'
                        }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Grid Usage Cost'
                    }
                }
            } as ChartOptions
        };

        const chart = new Chart(canvas, config);
        this.charts.set('cost', chart);
    }

    private initializeModeTimelineChart(): void {
        const canvas = document.getElementById('mode-timeline-chart') as HTMLCanvasElement;
        if (!canvas) return;

        const config = {
            type: 'line' as ChartType,
            data: {
                datasets: [
                    {
                        label: 'Planned Mode',
                        data: [] as ChartDataPoint[],
                        borderColor: 'rgb(255, 99, 132)',
                        backgroundColor: 'rgba(255, 99, 132, 0.2)',
                        stepped: true
                    },
                    {
                        label: 'Actual Mode',
                        data: [] as ChartDataPoint[],
                        borderColor: 'rgb(54, 162, 235)',
                        backgroundColor: 'rgba(54, 162, 235, 0.2)',
                        stepped: true
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
                            displayFormats: {
                                hour: 'HH:mm'
                            }
                        }
                    },
                    y: {
                        min: 0,
                        max: 4,
                        ticks: {
                            stepSize: 1,
                            callback: function(value) {
                                const modes = ['Unknown', 'Discharge', 'Solar Only', 'Grid + Solar'];
                                return modes[value as number] || value;
                            }
                        }
                    }
                }
            } as ChartOptions
        };

        const chart = new Chart(canvas, config);
        this.charts.set('mode-timeline', chart);
    }

    private initializeBatteryScheduleChart(): void {
        const canvas = document.getElementById('battery-schedule-chart') as HTMLCanvasElement;
        if (!canvas) return;

        const config = {
            type: 'line' as ChartType,
            data: {
                datasets: [{
                    label: 'Scheduled Battery Level (kWh)',
                    data: [] as ChartDataPoint[],
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            displayFormats: {
                                hour: 'HH:mm'
                            }
                        },
                        pointLabels: false
                    },
                    y: {
                        min: 0,
                        max: 12,
                        title: {
                            display: true,
                            text: 'Battery Level (kWh)'
                        }
                    }
                }
            } as ChartOptions
        };

        const chart = new Chart(canvas, config);
        this.charts.set('battery-schedule', chart);
    }

    private initializeGridPricingChart(): void {
        const canvas = document.getElementById('grid-pricing-chart') as HTMLCanvasElement;
        if (!canvas) return;

        const config = {
            type: 'line' as ChartType,
            data: {
                datasets: [{
                    label: 'Grid Price (£/kWh)',
                    data: [] as ChartDataPoint[],
                    borderColor: 'rgb(255, 205, 86)',
                    backgroundColor: 'rgba(255, 205, 86, 0.2)',
                    stepped: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            displayFormats: {
                                hour: 'HH:mm'
                            }
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Price (£/kWh)'
                        }
                    }
                }
            } as ChartOptions
        };

        const chart = new Chart(canvas, config);
        this.charts.set('grid-pricing', chart);
    }

    private initializePowerFlowChart(): void {
        const canvas = document.getElementById('power-flow-chart') as HTMLCanvasElement;
        if (!canvas) return;

        const config = {
            type: 'line' as ChartType,
            data: {
                datasets: [
                    {
                        label: 'Load (kW)',
                        data: [] as ChartDataPoint[],
                        borderColor: 'rgb(255, 99, 132)',
                        backgroundColor: 'rgba(255, 99, 132, 0.2)'
                    },
                    {
                        label: 'Grid (kW)',
                        data: [] as ChartDataPoint[],
                        borderColor: 'rgb(54, 162, 235)',
                        backgroundColor: 'rgba(54, 162, 235, 0.2)'
                    },
                    {
                        label: 'Solar (kW)',
                        data: [] as ChartDataPoint[],
                        borderColor: 'rgb(255, 205, 86)',
                        backgroundColor: 'rgba(255, 205, 86, 0.2)'
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
                            displayFormats: {
                                hour: 'HH:mm'
                            }
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Power (kW)'
                        }
                    }
                }
            } as ChartOptions
        };

        const chart = new Chart(canvas, config);
        this.charts.set('power-flow', chart);
    }

    updateMetricsChart(metrics: MetricInstance[]): void {
        const chart = this.charts.get('realtime');
        if (!chart || !metrics.length) return;

        const loadData = metrics.map(m => ({ x: m.timestamp, y: m.loadPower / 1000 }));
        const gridData = metrics.map(m => ({ x: m.timestamp, y: m.gridPower / 1000 }));
        const batteryData = metrics.map(m => ({ x: m.timestamp, y: m.batteryPower / 1000 }));

        chart.data.datasets[0]!.data = loadData;
        chart.data.datasets[1]!.data = gridData;
        chart.data.datasets[2]!.data = batteryData;

        chart.update('none');
    }

    updateScheduleCharts(scheduleData: Schedule, metrics?: MetricInstance[]): void {
        this.updateModeTimelineChart(scheduleData, metrics);
        this.updateBatteryScheduleChart(scheduleData);
        this.updateGridPricingChart(scheduleData);
        this.updatePowerFlowChart(scheduleData);
    }

    updateExpectedVsActualBatteryChargeChart(metrics: MetricInstance[], schedule: Schedule): void {
        const chart = this.charts.get('charge');
        if (!chart) return;

        const actualData = metrics.map(m => ({ x: m.timestamp, y: m.batteryCharge }));
        
        let expectedData: ChartDataPoint[] = [];
        if (schedule) {
            expectedData = metrics.map(m => ({
                x: m.timestamp,
                y: this.dataProcessor.getExpectedBatteryLevel(m.timestamp, schedule) || 0
            }));
        }

        chart.data.datasets[0]!.data = expectedData;
        chart.data.datasets[1]!.data = actualData;

        chart.update('none');
    }

    updateCostChart(totalCost: number): void {
        const chart = this.charts.get('cost');
        if (!chart) return;

        chart.data.labels = ['Today'];
        chart.data.datasets[0]!.data = [{x: Date.now(), y: totalCost}];

        chart.update('none');
    }

    private updateModeTimelineChart(scheduleData: Schedule, metrics?: MetricInstance[]): void {
        const chart = this.charts.get('mode-timeline');
        if (!chart) return;

        const modeData = this.dataProcessor.processModeTimelineData(scheduleData, metrics || []);
        
        chart.data.datasets[0]!.data = modeData.planned;
        chart.data.datasets[1]!.data = modeData.actual;

        chart.update('none');
    }

    private updateBatteryScheduleChart(scheduleData: Schedule): void {
        const chart = this.charts.get('battery-schedule');
        if (!chart) return;

        const batteryData = this.dataProcessor.processBatteryScheduleData(scheduleData);
        chart.data.datasets[0]!.data = batteryData;

        chart.update('none');
    }

    private updateGridPricingChart(scheduleData: Schedule): void {
        const chart = this.charts.get('grid-pricing');
        if (!chart) return;

        const pricingData = this.dataProcessor.processGridPricingData(scheduleData);
        chart.data.datasets[0]!.data = pricingData;

        chart.update('none');
    }

    private updatePowerFlowChart(scheduleData: Schedule): void {
        const chart = this.charts.get('power-flow');
        if (!chart) return;

        const powerFlowData = this.dataProcessor.processPowerFlowData(scheduleData);
        
        chart.data.datasets[0]!.data = powerFlowData.load;
        chart.data.datasets[1]!.data = powerFlowData.grid;
        chart.data.datasets[2]!.data = powerFlowData.solar;

        chart.update('none');
    }

    shouldUpdateCharts(): boolean {
        const now = Date.now();
        if (now - this.lastUpdateTime < this.updateThrottleMs) {
            return false;
        }
        this.lastUpdateTime = now;
        return true;
    }

    destroy(): void {
        this.charts.forEach(chart => chart.destroy());
        this.charts.clear();
    }
}
