import { Chart, ChartOptions, ChartData } from 'chart.js';
import { BaseChartProcessor } from './chart-interface';
import { ChartDataPoint } from '../types';
import { MetricInstance } from '@shared';
import { Schedule } from '../types/front-end-time-segment';

export class BatteryChargeChart extends BaseChartProcessor {
    readonly chartId = 'charge';
    readonly canvasId = 'charge-chart';
    
    initialize(): void {
        const canvas = this.getCanvas();
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

        this.chart = new Chart(canvas, config);
    }
    
    processData(metrics: MetricInstance[], schedule: Schedule): void {
        this.processedData = this.processBatteryChargeData(metrics, schedule);
    }
    
    protected applyDataToChart(): void {
        if (!this.chart || !this.processedData) return;
        
        this.chart.data.datasets[0]!.data = this.processedData.expectedData;
        this.chart.data.datasets[1]!.data = this.processedData.actualData;
        
        console.log('Charge vs Actual Data:', this.processedData);
    }
    
    private processBatteryChargeData(metrics: MetricInstance[], schedule: Schedule) {
        const actualData = metrics.map(m => {
            if (Number.isNaN(m.batteryCapacity)) {
                throw new Error(`Invalid battery capacity: ${m.batteryCapacity} for timestamp ${m.timestamp}`);
            }
            if (Number.isNaN(m.batteryChargePercent)) {
                throw new Error(`Invalid battery charge: ${m.batteryChargePercent} for timestamp ${m.timestamp}`);
            }
            const y = m.batteryChargePercent / 100 * m.batteryCapacity;
            if (Number.isNaN(y)) {
                throw new Error(`Calculated battery charge is NaN for timestamp ${m.timestamp}`);
            }
            return { x: m.timestamp, y: y };
        });
        
        const expectedData: ChartDataPoint[] = schedule.map(m => {
            const time = m.time.segmentStart.epochMilliseconds;
            return {
                x: time,
                y: m.endBatteryChargeKwh
            };
        });

        return {
            expectedData,
            actualData
        };
    }
}