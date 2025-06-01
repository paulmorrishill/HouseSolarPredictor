import { Chart } from 'chart.js';
import { MetricInstance } from '@shared';
import { Schedule } from '../types/front-end-time-segment';

export interface ChartProcessor {
    readonly chartId: string;
    readonly canvasId: string;
    
    initialize(): void;
    processData(metrics: MetricInstance[], schedule: Schedule): void;
    updateChart(): void;
    destroy(): void;
    getChart(): Chart | null;
}

export abstract class BaseChartProcessor implements ChartProcessor {
    protected chart: Chart | null = null;
    protected processedData: any = null;
    
    abstract readonly chartId: string;
    abstract readonly canvasId: string;
    
    abstract initialize(): void;
    abstract processData(metrics: MetricInstance[], schedule: Schedule): void;
    
    updateChart(): void {
        if (this.chart && this.processedData) {
            this.applyDataToChart();
            this.chart.update('none');
        }
    }
    
    protected abstract applyDataToChart(): void;
    
    destroy(): void {
        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }
    }
    
    getChart(): Chart | null {
        return this.chart;
    }
    
    protected getCanvas(): HTMLCanvasElement | null {
        return document.getElementById(this.canvasId) as HTMLCanvasElement;
    }
}