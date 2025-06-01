import { Chart, ChartType, ChartOptions } from 'chart.js';
import { BaseChartProcessor } from './chart-interface';
import { MetricInstance } from '@shared';
import { Schedule } from '../types/front-end-time-segment';

export class CostChart extends BaseChartProcessor {
    readonly chartId = 'cost';
    readonly canvasId = 'cost-chart';
    
    initialize(): void {
        const canvas = this.getCanvas();
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

        this.chart = new Chart(canvas, config);
    }
    
    processData(_metrics: MetricInstance[], _schedule: Schedule): void {
        // This chart doesn't use the standard processData pattern
        // It's updated directly via updateCost method
    }
    
    protected applyDataToChart(): void {
        // This chart is updated directly via updateCost method
    }
    
    updateCost(totalCost: number): void {
        if (!this.chart) return;

        this.chart.data.labels = ['Today'];
        this.chart.data.datasets[0]!.data = [{ x: Date.now(), y: totalCost }];

        this.chart.update('none');
    }
}