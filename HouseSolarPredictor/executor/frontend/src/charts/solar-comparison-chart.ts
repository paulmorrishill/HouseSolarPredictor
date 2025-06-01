import { Chart, ChartType, ChartOptions, ChartConfiguration } from 'chart.js';
import { BaseChartProcessor } from './chart-interface';
import { ChartDataPoint } from '../types';
import { MetricInstance } from '@shared';
import { Schedule } from '../types/front-end-time-segment';

interface SolarComparisonData {
    actual: ChartDataPoint[];
    scheduled: ChartDataPoint[];
}

export class SolarComparisonChart extends BaseChartProcessor {
    readonly chartId = 'solar-comparison';
    readonly canvasId = 'solar-comparison-chart';
    
    initialize(): void {
        const canvas = this.getCanvas();
        if (!canvas) return;

        const config: ChartConfiguration = {
            type: 'line' as ChartType,
            data: {
                datasets: [
                    {
                        label: 'Actual Solar Power (kW)',
                        data: [] as ChartDataPoint[],
                        borderColor: 'rgb(255, 193, 7)',
                        backgroundColor: 'rgba(255, 193, 7, 0.2)',
                        tension: 0.1,
                        pointRadius: 2
                    },
                    {
                        label: 'Scheduled Solar Power (kW)',
                        data: [] as ChartDataPoint[],
                        borderColor: 'rgb(255, 152, 0)',
                        backgroundColor: 'rgba(255, 152, 0, 0.2)',
                        borderDash: [5, 5],
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
                        },
                        beginAtZero: true
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Solar Power: Actual vs Scheduled'
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
    
    processData(metrics: MetricInstance[], schedule: Schedule): void {
        this.processedData = this.processSolarComparisonData(schedule, metrics);
    }
    
    protected applyDataToChart(): void {
        if (!this.chart || !this.processedData) return;
        
        const solarComparisonData = this.processedData as SolarComparisonData;
        this.chart.data.datasets[0]!.data = solarComparisonData.actual;
        this.chart.data.datasets[1]!.data = solarComparisonData.scheduled;
    }
    
    private processSolarComparisonData(scheduleData: Schedule, metrics: MetricInstance[]): SolarComparisonData {
        if (!Array.isArray(scheduleData) || !Array.isArray(metrics)) {
            return { actual: [], scheduled: [] };
        }

        // Process actual solar power from metrics (convert from W to kW)
        const actualSolarData: ChartDataPoint[] = metrics.map(metric => ({
            x: metric.timestamp,
            y: metric.solarPower / 1000 // Convert W to kW
        }));

        // Process scheduled solar power from schedule data
        const scheduledSolarData: ChartDataPoint[] = [];
        scheduleData.forEach(segment => {
            const startTime = segment.time.segmentStart.epochMilliseconds;
            const endTime = segment.time.segmentEnd.epochMilliseconds;
            
            const solarKw = segment.expectedSolarGeneration * 2;

            const midPoint = startTime + (endTime - startTime);
            scheduledSolarData.push({ x: midPoint, y: solarKw });
        });

        return {
            actual: actualSolarData.sort((a, b) => (a.x as number) - (b.x as number)),
            scheduled: scheduledSolarData.sort((a, b) => (a.x as number) - (b.x as number))
        };
    }
}