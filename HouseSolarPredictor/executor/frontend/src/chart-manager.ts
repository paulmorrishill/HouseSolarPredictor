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
    ChartType, ChartData, Filler
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import annotationPlugin from 'chartjs-plugin-annotation';

import { Logger } from './logger';
import { DataProcessor } from './data-processor';
import { ChartDataPoint } from './types';
import {MetricInstance} from "@shared";
import {ChartConfiguration} from "chart.js/dist/types";
import {FrontEndTimeSegment, Schedule} from "./types/front-end-time-segment";

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
    TimeScale,
    annotationPlugin,
    Filler
);
interface ModeAnnotation {
    type: 'box';
    xMin: Date;
    xMax: Date;
    backgroundColor: string;
    borderWidth: number;
    drawTime: 'beforeDatasetsDraw';
    label: {
        display: boolean;
        content: string;
    };
}

interface CostCalculator {
    name: string;
    id: string;
    calculate: (segment: FrontEndTimeSegment) => number;
}

export class ChartManager {
    private readonly logger: Logger;
    private readonly dataProcessor: DataProcessor;
    private charts: Map<string, Chart<any, any, any>> = new Map();
    private lastUpdateTime: number = 0;
    private readonly updateThrottleMs: number = 1000; // 1 second throttle
    private costCalculators: CostCalculator[] = [
        {
            name: 'Actual Schedule Cost',
            id: 'schedule-cost',
            calculate: (segment: FrontEndTimeSegment) => segment.cost || 0
        },
        {
            name: 'No Battery/Solar Cost',
            id: 'no-battery-solar-cost',
            calculate: (segment: FrontEndTimeSegment) => {
                // Cost if using no battery or solar (Load times grid price)
                const loadKwh = segment.expectedConsumption;
                const pricePerKwh = segment.gridPrice; // Convert pence to pounds
                return loadKwh * pricePerKwh;
            }
        },
        {
            name: 'Fixed Price (29.4p/kWh)',
            id: 'fixed-price-cost',
            calculate: (segment: FrontEndTimeSegment) => {
                // Cost if on fixed price of 29.4p per unit
                const loadKwh = segment.expectedConsumption;
                const fixedPricePerKwh = 0.294;
                return loadKwh * fixedPricePerKwh;
            }
        },
        {
            name: 'Time-based Tariff (6.7p/27.03p)',
            id: 'time-based-cost',
            calculate: (segment: FrontEndTimeSegment) => {
                // Cost based on time: 00:00-07:00 = 6.7p, other times = 27.03p
                const segmentStart = segment.time.segmentStart;
                const hour = segmentStart.toZonedDateTimeISO('Europe/London').hour;
                
                const loadKwh = segment.expectedConsumption;
                const isNightRate = hour >= 0 && hour < 7; // 00:00-07:00
                const pricePerKwh = isNightRate ? 0.067 : 0.2703; // Convert pence to pounds
                
                return loadKwh * pricePerKwh;
            }
        }
    ];

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
            this.initializeEstimatedCostChart();
            this.initializeModeTimelineChart();
            this.initializeBatteryScheduleChart();
            this.initializeGridPricingChart();
            this.initializePowerFlowChart();
            
            this.logger.addLogEntry('✅ All charts initialized successfully', 'info');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.addLogEntry(`❌ Chart initialization failed: ${errorMessage}`, 'error');
            throw error;
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

        const config: {
            type: 'line';
            data: ChartData<'line', ChartDataPoint[]>;
            options: ChartOptions<'line'>;
        } = {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'Expected Battery Level (kWh)',
                        data: [] as ChartDataPoint[],
                        borderColor: 'rgb(75, 192, 192)',
                        backgroundColor: 'rgba(75, 192, 192, 0.2)',
                        borderDash: [5, 5],
                        tension: 0.1,
                        pointRadius: 1
                    },
                    {
                        label: 'Actual Battery Level (kWh)',
                        data: [] as ChartDataPoint[],
                        borderColor: 'rgb(153, 102, 255)',
                        backgroundColor: 'rgba(153, 102, 255, 0.2)',
                        tension: 0.1,
                        pointRadius: 1
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
            }
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
                    borderWidth: 1,
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

    private initializeEstimatedCostChart(): void {
        const canvas = document.getElementById('estimated-cost-chart') as HTMLCanvasElement;
        if (!canvas) return;

        const config = {
            type: 'line' as ChartType,
            data: {
                datasets: [{
                    label: 'Estimated Cost (£)',
                    data: [] as ChartDataPoint[],
                    borderColor: 'rgb(220, 53, 69)',
                    backgroundColor: 'rgba(220, 53, 69, 0.2)',
                    tension: 0.1,
                    fill: true
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
                        title: {
                            display: true,
                            text: 'Time'
                        }
                    },
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
                        text: 'Estimated Schedule Cost Over Time'
                    }
                }
            } as ChartOptions
        };

        const chart = new Chart(canvas, config);
        this.charts.set('estimated-cost', chart);
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
                    borderColor: 'rgb(220, 53, 69)',
                    backgroundColor: 'rgba(220, 53, 69, 0.2)',
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
                },
                plugins: {
                    annotation: {
                        annotations: {}
                    }
                }
            } as ChartOptions
        };



        const chart = new Chart(canvas, config);
        this.charts.set('grid-pricing', chart);
    }

    createModeAnnotations(scheduleData: Schedule): Record<string, ModeAnnotation> {
        if (!Array.isArray(scheduleData)) return {};

        const annotations:Record<string, ModeAnnotation> = {};
        const modeColors: Record<string, string> = {
            'ChargeFromGridAndSolar': 'rgba(33, 150, 243, 0.2)', // Blue
            'ChargeSolarOnly': 'rgba(255, 193, 7, 0.2)',         // Yellow
            'Discharge': 'rgba(76, 175, 80, 0.2)'                // Green
        };

        const modeLabels: Record<string, string> = {
            'ChargeFromGridAndSolar': 'Charge Grid + Solar',
            'ChargeSolarOnly': 'Charge Solar Only',
            'Discharge': 'Discharge'
        };

        scheduleData.forEach((segment, index) => {
            const startTime = segment.time.segmentStart;
            const endTime = segment.time.segmentEnd;
            const mode = segment.mode;
            const color = modeColors[mode] || 'rgba(128, 128, 128, 0.2)';
            const label = modeLabels[mode] || mode;

            annotations[`mode_${index}`] = {
                type: 'box',
                xMin: new Date(startTime.epochMilliseconds),
                xMax: new Date(endTime.epochMilliseconds),
                backgroundColor: color,
                borderWidth: 0,
                drawTime: 'beforeDatasetsDraw',
                label: {
                    display: false,
                    content: label
                }
            };
        });

        return annotations;
    }

    private initializePowerFlowChart(): void {
        const canvas = document.getElementById('power-flow-chart') as HTMLCanvasElement;
        if (!canvas) return;

        const config: ChartConfiguration = {
            type: 'line' as ChartType,
            data: {
                datasets: [
                    {
                        label: 'Load (kW)',
                        data: [] as ChartDataPoint[],
                        borderColor: 'rgb(255, 99, 132)',
                        backgroundColor: 'rgba(255, 99, 132, 0.2)',
                        tension: 0.5
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
                        backgroundColor: 'rgba(255, 205, 86, 0.2)',
                        tension: 0.5
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

    updateHistoricCharts(scheduleData: Schedule, metrics: MetricInstance[]): void {
        this.updateModeTimelineChart(scheduleData, metrics);
        this.updateBatteryScheduleChart(scheduleData);
        this.updateGridPricingChart(scheduleData);
        this.updatePowerFlowChart(scheduleData);
        this.updateEstimatedCostChart(scheduleData);
    }

    updateExpectedVsActualBatteryChargeChart(metrics: MetricInstance[], schedule: Schedule): void {
        const chart = this.charts.get('charge');
        if (!chart) return;

        const actualData = metrics.map(m => {
            if(Number.isNaN(m.batteryCapacity)) {
                throw new Error(`Invalid battery capacity: ${m.batteryCapacity} for timestamp ${m.timestamp}`);
            }
            if(Number.isNaN(m.batteryChargePercent)) {
                throw new Error(`Invalid battery charge: ${m.batteryCapacity} for timestamp ${m.timestamp}`);
            }
            let y = m.batteryChargePercent / 100 * m.batteryCapacity;
            if(Number.isNaN(y)) {
                throw new Error(`Calculated battery charge is NaN for timestamp ${m.timestamp}`);
            }
            return ({x: m.timestamp, y: y});
        });
        
        let expectedData: ChartDataPoint[] = [];
        expectedData = schedule.map(m => {
            let time = m.time.segmentStart.epochMilliseconds;
            return ({
                x: time,
                y: m.endBatteryChargeKwh
            });
        });

        chart.data.datasets[0]!.data = expectedData;
        chart.data.datasets[1]!.data = actualData;

        console.log('Charge vs Actual Data:', { expectedData, actualData });

        chart.update('none');
    }

    updateCostChart(totalCost: number): void {
        const chart = this.charts.get('cost');
        if (!chart) return;

        chart.data.labels = ['Today'];
        chart.data.datasets[0]!.data = [{x: Date.now(), y: totalCost}];

        chart.update('none');
    }

    private updateModeTimelineChart(scheduleData: Schedule, metrics: MetricInstance[]): void {
        const chart = this.charts.get('mode-timeline');
        if (!chart) return;

        const modeData = this.dataProcessor.processModeTimelineData(scheduleData, metrics);
        
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

        const annotations = this.createModeAnnotations(scheduleData);
        chart.options.plugins.annotation = {
            annotations: annotations
        };

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

    private updateEstimatedCostChart(scheduleData: Schedule): void {
        const chart = this.charts.get('estimated-cost');
        if (!chart) return;

        // Use the first calculator (actual schedule cost) for the chart display
        const primaryCalculator = this.costCalculators[0]!;
        
        const costData: ChartDataPoint[] = [];

        scheduleData.forEach(segment => {
            const segmentCost = primaryCalculator.calculate(segment);
            costData.push({
                x: segment.time.segmentStart.epochMilliseconds,
                y: segmentCost
            });
            costData.push({
                x: segment.time.segmentEnd.epochMilliseconds,
                y: segmentCost
            });
        });

        chart.data.datasets[0]!.data = costData;

        // Calculate and display all cost types
        this.updateCostCalculations(scheduleData);

        chart.update('none');
    }

    private updateCostCalculations(scheduleData: Schedule): void {
        const costCalculationsContainer = document.getElementById('cost-calculations');
        if (!costCalculationsContainer) return;

        // Clear existing calculations
        costCalculationsContainer.innerHTML = '';

        // Calculate totals for each calculator
        this.costCalculators.forEach(calculator => {
            let totalCost = 0;
            
            scheduleData.forEach(segment => {
                totalCost += calculator.calculate(segment);
            });

            // Create cost item element
            const costItem = document.createElement('div');
            costItem.className = 'cost-item';
            costItem.innerHTML = `
                <span class="cost-label">${calculator.name}:</span>
                <span class="cost-value" id="${calculator.id}">£${totalCost.toFixed(2)}</span>
            `;
            
            costCalculationsContainer.appendChild(costItem);
        });
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

    updateCurrentCharts(limitedCurrentMetrics: MetricInstance[], currentSchedule: FrontEndTimeSegment[]) {
        this.updateExpectedVsActualBatteryChargeChart(limitedCurrentMetrics, currentSchedule);
        this.updateMetricsChart(limitedCurrentMetrics);
    }
}
