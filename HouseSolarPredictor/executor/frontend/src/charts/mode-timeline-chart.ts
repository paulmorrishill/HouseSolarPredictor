import {Chart, ChartType, ChartOptions, ChartConfiguration} from 'chart.js';
import { BaseChartProcessor } from './chart-interface';
import { ChartDataPoint } from '../types';
import { MetricInstance } from '@shared';
import { Schedule } from '../types/front-end-time-segment';

const MODE_CHARGE_FROM_GRID_AND_SOLAR = 3;
const MODE_CHARGE_SOLAR_ONLY = 2;
const MODE_DISCHARGE = 1;

interface ModeTimelineData {
    planned: ChartDataPoint[];
    actual: ChartDataPoint[];
}

export class ModeTimelineChart extends BaseChartProcessor {
    readonly chartId = 'mode-timeline';
    readonly canvasId = 'mode-timeline-chart';
    
    initialize(): void {
        const canvas = this.getCanvas();
        if (!canvas) return;

        const config: ChartConfiguration = {
            type: 'line' as ChartType,
            data: {
                datasets: [
                    {
                        label: 'Planned Mode',
                        data: [] as ChartDataPoint[],
                        borderColor: 'rgb(255, 99, 132)',
                        backgroundColor: 'rgba(255, 99, 132, 0.2)',
                        stepped: true,
                        borderDash: [5, 5],
                        pointRadius: 1
                    },
                    {
                        label: 'Actual Mode',
                        data: [] as ChartDataPoint[],
                        borderColor: 'rgb(54, 162, 235)',
                        backgroundColor: 'rgba(54, 162, 235, 0.2)',
                        stepped: true,
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

        this.chart = new Chart(canvas, config);
    }
    
    processData(metrics: MetricInstance[], schedule: Schedule): void {
        this.processedData = this.processModeTimelineData(schedule, metrics);
    }
    
    protected applyDataToChart(): void {
        if (!this.chart || !this.processedData) return;
        
        const modeData = this.processedData as ModeTimelineData;
        this.chart.data.datasets[0]!.data = modeData.planned;
        this.chart.data.datasets[1]!.data = modeData.actual;
    }
    
    private processModeTimelineData(scheduleData: Schedule, historicData: MetricInstance[]): ModeTimelineData {
        if (!Array.isArray(scheduleData)) return {
            planned: [],
            actual: []
        };

        const plannedMode: ChartDataPoint[] = [];

        scheduleData.forEach((segment, i) => {
            const startTime = segment.time.segmentStart;
            const endTime = segment.time.segmentEnd;
            const modeValue = this.convertPlannedModeToNumeric(segment.mode);

            plannedMode.push({ x: startTime.epochMilliseconds, y: modeValue });
            if (i === scheduleData.length - 1) {
                plannedMode.push({ x: endTime.epochMilliseconds, y: modeValue });
            }
        });

        const actualModes = historicData.filter(m => m.workModePriority).map(metric => {
            const startTime = metric.timestamp;
            const modeValue = this.convertActualModeToNumeric(metric);

            return { x: startTime, y: modeValue };
        });

        if (actualModes.length > 0) {
            const lastMode = actualModes[actualModes.length - 1];
            if (lastMode) {
                actualModes.push({ x: Date.now(), y: lastMode.y });
            }
        }

        const dedupedModes: ChartDataPoint[] = [];
        if (actualModes.length > 0 && actualModes[0]) {
            dedupedModes.push(actualModes[0]);

            for (let i = 1; i < actualModes.length; i++) {
                const mostRecentMode = dedupedModes[dedupedModes.length - 1];
                const currentDataPoint = actualModes[i];
                const previousDataPoint = actualModes[i - 1];

                if (mostRecentMode && currentDataPoint && previousDataPoint) {
                    const modeHasChanged = mostRecentMode.y !== currentDataPoint.y;
                    if (modeHasChanged) {
                        dedupedModes.push(previousDataPoint);
                        dedupedModes.push(currentDataPoint);
                    }
                }
            }
        }

        const chartData = {
            planned: plannedMode.sort((a, b) => (a.x) - (b.x)),
            actual: dedupedModes.sort((a, b) => (a.x) - (b.x))
        };

        console.log(`Processed MODE timeline data: Planned segments: ${chartData.planned.length}, Actual segments: ${chartData.actual.length}`);
        return chartData;
    }
    
    private convertPlannedModeToNumeric(mode: string): number {
        const modeMap: Record<string, number> = {
            'ChargeFromGridAndSolar': MODE_CHARGE_FROM_GRID_AND_SOLAR,
            'ChargeSolarOnly': MODE_CHARGE_SOLAR_ONLY,
            'Discharge': MODE_DISCHARGE
        };
        return modeMap[mode] || 0;
    }

    private convertActualModeToNumeric(metric: MetricInstance): number {
        if (metric.workModePriority === 'Battery first') {
            if (metric.batteryChargeRate > 50) {
                return MODE_CHARGE_FROM_GRID_AND_SOLAR;
            } else {
                return MODE_CHARGE_SOLAR_ONLY;
            }
        }
        if (metric.workModePriority === 'Load first') {
            return MODE_DISCHARGE;
        }

        throw new Error('Unknown work mode priority: ' + metric.workModePriority);
    }
}
