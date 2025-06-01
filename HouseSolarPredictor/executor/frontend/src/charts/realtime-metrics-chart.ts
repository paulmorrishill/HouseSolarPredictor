import {Chart, ChartType, ChartOptions, ChartConfiguration} from 'chart.js';
import { BaseChartProcessor } from './chart-interface';
import { ChartDataPoint } from '../types';
import { MetricInstance } from '@shared';
import { Schedule } from '../types/front-end-time-segment';

export class RealtimeMetricsChart extends BaseChartProcessor {
    readonly chartId = 'realtime';
    readonly canvasId = 'realtime-chart';
    
    initialize(): void {
        const canvas = this.getCanvas();
        if (!canvas) return;

        const config: ChartConfiguration = {
            type: 'line' as ChartType,
            data: {
                datasets: [
                    {
                        label: 'Load Power (kW)',
                        data: [] as ChartDataPoint[],
                        borderColor: 'rgb(255, 99, 132)',
                        backgroundColor: 'rgba(255, 99, 132, 0.2)',
                        tension: 0.1,
                        pointRadius: 0
                    },
                    {
                        label: 'Grid Power (kW)',
                        data: [] as ChartDataPoint[],
                        borderColor: 'rgb(54, 162, 235)',
                        backgroundColor: 'rgba(54, 162, 235, 0.2)',
                        tension: 0.1,
                        pointRadius: 0
                    },
                    {
                        label: 'Battery Power (kW)',
                        data: [] as ChartDataPoint[],
                        borderColor: 'rgb(255, 205, 86)',
                        backgroundColor: 'rgba(255, 205, 86, 0.2)',
                        tension: 0.1,
                        pointRadius: 0
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

        this.chart = new Chart(canvas, config);
    }
    
    processData(metrics: MetricInstance[], _schedule: Schedule): void {
        this.processedData = this.processRealtimeMetricsData(metrics);
    }
    
    protected applyDataToChart(): void {
        if (!this.chart || !this.processedData) return;
        
        this.chart.data.datasets[0]!.data = this.processedData.loadData;
        this.chart.data.datasets[1]!.data = this.processedData.gridData;
        this.chart.data.datasets[2]!.data = this.processedData.batteryData;
    }
    
    private processRealtimeMetricsData(metrics: MetricInstance[]) {
        if (!Array.isArray(metrics) || metrics.length === 0) {
            return {
                loadData: [],
                gridData: [],
                batteryData: []
            };
        }

        const loadData = metrics.map(m => ({ x: m.timestamp, y: m.loadPower / 1000 }));
        const gridData = metrics.map(m => ({ x: m.timestamp, y: m.gridPower / 1000 }));
        const batteryData = metrics.map(m => ({ x: m.timestamp, y: m.batteryPower / 1000 }));

        return {
            loadData,
            gridData,
            batteryData
        };
    }
}
