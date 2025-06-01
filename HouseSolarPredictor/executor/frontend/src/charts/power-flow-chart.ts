import { Chart, ChartType, ChartOptions, ChartConfiguration } from 'chart.js';
import { BaseChartProcessor } from './chart-interface';
import { ChartDataPoint } from '../types';
import { MetricInstance } from '@shared';
import { Schedule } from '../types/front-end-time-segment';

interface PowerFlowData {
    load: ChartDataPoint[];
    grid: ChartDataPoint[];
    solar: ChartDataPoint[];
}

export class PowerFlowChart extends BaseChartProcessor {
    readonly chartId = 'power-flow';
    readonly canvasId = 'power-flow-chart';
    
    initialize(): void {
        const canvas = this.getCanvas();
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

        this.chart = new Chart(canvas, config);
    }
    
    processData(_metrics: MetricInstance[], schedule: Schedule): void {
        this.processedData = this.processPowerFlowData(schedule);
    }
    
    protected applyDataToChart(): void {
        if (!this.chart || !this.processedData) return;
        
        const powerFlowData = this.processedData as PowerFlowData;
        this.chart.data.datasets[0]!.data = powerFlowData.load;
        this.chart.data.datasets[1]!.data = powerFlowData.grid;
        this.chart.data.datasets[2]!.data = powerFlowData.solar;
    }
    
    private processPowerFlowData(scheduleData: Schedule): PowerFlowData {
        if (!Array.isArray(scheduleData)) return { load: [], grid: [], solar: [] };

        const loadData: ChartDataPoint[] = [];
        const gridData: ChartDataPoint[] = [];
        const solarData: ChartDataPoint[] = [];

        scheduleData.forEach((segment) => {
            const startTime = segment.time.segmentStart;
            
            // Convert kWh to kW (divide by 0.5 for 30-minute segments)
            const loadKw = segment.expectedConsumption / 0.5;
            const gridKw = segment.actualGridUsage / 0.5;
            const solarKw = segment.expectedSolarGeneration / 0.5;

            loadData.push({ x: startTime.epochMilliseconds, y: loadKw });
            gridData.push({ x: startTime.epochMilliseconds, y: gridKw });
            solarData.push({ x: startTime.epochMilliseconds, y: solarKw });

            // Add end point for each segment
            const endTime = segment.time.segmentEnd;
            gridData.push({ x: endTime.epochMilliseconds, y: gridKw });
        });

        // Remove duplicate points
        const uniqueLoadData = loadData.filter((point, index, self) =>
            index === self.findIndex(p => p.x === point.x && p.y === point.y));
        const uniqueGridData = gridData.filter((point, index, self) =>
            index === self.findIndex(p => p.x === point.x && p.y === point.y));
        const uniqueSolarData = solarData.filter((point, index, self) =>
            index === self.findIndex(p => p.x === point.x && p.y === point.y));

        return {
            load: uniqueLoadData.sort((a, b) => (a.x as number) - (b.x as number)),
            grid: uniqueGridData.sort((a, b) => (a.x as number) - (b.x as number)),
            solar: uniqueSolarData.sort((a, b) => (a.x as number) - (b.x as number))
        };
    }
}