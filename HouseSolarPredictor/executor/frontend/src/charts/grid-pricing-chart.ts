import { Chart, ChartType, ChartOptions } from 'chart.js';
import { BaseChartProcessor } from './chart-interface';
import { ChartDataPoint } from '../types';
import { MetricInstance } from '@shared';
import { Schedule } from '../types/front-end-time-segment';
import { createModeAnnotations, createModeLegend } from './mode-overlay-utils';

export class GridPricingChart extends BaseChartProcessor {
    readonly chartId = 'grid-pricing';
    readonly canvasId = 'grid-pricing-chart';
    
    initialize(): void {
        const canvas = this.getCanvas();
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

        this.chart = new Chart(canvas, config);
        
        // Create the mode legend
        createModeLegend('grid-pricing-container');
    }
    
    processData(_metrics: MetricInstance[], schedule: Schedule): void {
        this.processedData = {
            pricingData: this.processGridPricingData(schedule),
            annotations: createModeAnnotations(schedule)
        };
    }
    
    protected applyDataToChart(): void {
        if (!this.chart || !this.processedData) return;
        
        this.chart.data.datasets[0]!.data = this.processedData.pricingData;
        
        if (this.chart.options.plugins) {
            (this.chart.options.plugins as any).annotation = {
                annotations: this.processedData.annotations
            };
        }
    }
    
    private processGridPricingData(scheduleData: Schedule): ChartDataPoint[] {
        if (!Array.isArray(scheduleData)) return [];

        const data: ChartDataPoint[] = [];
        scheduleData.forEach((segment, i) => {
            const startTime = segment.time.segmentStart;
            const endTime = segment.time.segmentEnd;
            const priceInPounds = segment.gridPrice;

            data.push({ x: startTime.epochMilliseconds, y: priceInPounds });
            if (i < scheduleData.length - 1) {
                data.push({ x: endTime.epochMilliseconds, y: priceInPounds });
            }
        });

        return data.sort((a, b) => (a.x as number) - (b.x as number));
    }
    
}