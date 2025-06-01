import { Chart, ChartType, ChartOptions } from 'chart.js';
import { BaseChartProcessor } from './chart-interface';
import { ChartDataPoint } from '../types';
import { MetricInstance } from '@shared';
import { Schedule } from '../types/front-end-time-segment';

export class BatteryScheduleChart extends BaseChartProcessor {
    readonly chartId = 'battery-schedule';
    readonly canvasId = 'battery-schedule-chart';
    
    initialize(): void {
        const canvas = this.getCanvas();
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

        this.chart = new Chart(canvas, config);
    }
    
    processData(_metrics: MetricInstance[], schedule: Schedule): void {
        this.processedData = this.processBatteryScheduleData(schedule);
    }
    
    protected applyDataToChart(): void {
        if (!this.chart || !this.processedData) return;
        
        this.chart.data.datasets[0]!.data = this.processedData;
    }
    
    private processBatteryScheduleData(scheduleData: Schedule): ChartDataPoint[] {
        if (!Array.isArray(scheduleData)) return [];

        const data: ChartDataPoint[] = [];
        scheduleData.forEach(segment => {
            const startTime = segment.time.segmentStart;
            const endTime = segment.time.segmentEnd;

            data.push({
                x: startTime.epochMilliseconds,
                y: segment.startBatteryChargeKwh
            });
            data.push({
                x: endTime.epochMilliseconds,
                y: segment.endBatteryChargeKwh
            });
        });

        return data.sort((a, b) => (a.x) - (b.x));
    }
}