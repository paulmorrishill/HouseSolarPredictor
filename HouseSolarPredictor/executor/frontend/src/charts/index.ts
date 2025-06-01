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
    Filler
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import annotationPlugin from 'chartjs-plugin-annotation';

import { ChartProcessor } from './chart-interface';
import { ModeTimelineChart } from './mode-timeline-chart';
import { BatteryScheduleChart } from './battery-schedule-chart';
import { GridPricingChart } from './grid-pricing-chart';
import { PowerFlowChart } from './power-flow-chart';
import { SolarComparisonChart } from './solar-comparison-chart';
import { EstimatedCostChart } from './estimated-cost-chart';
import { RealtimeMetricsChart } from './realtime-metrics-chart';
import { BatteryChargeChart } from './battery-charge-chart';
import { CostChart } from './cost-chart';

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

export * from './chart-interface';
export * from './mode-timeline-chart';
export * from './battery-schedule-chart';
export * from './grid-pricing-chart';
export * from './power-flow-chart';
export * from './solar-comparison-chart';
export * from './estimated-cost-chart';
export * from './realtime-metrics-chart';
export * from './battery-charge-chart';
export * from './cost-chart';

export class ChartRegistry {
    private charts: Map<string, ChartProcessor> = new Map();
    
    constructor() {
        this.registerCharts();
    }
    
    private registerCharts(): void {
        const chartClasses = [
            ModeTimelineChart,
            BatteryScheduleChart,
            GridPricingChart,
            PowerFlowChart,
            SolarComparisonChart,
            EstimatedCostChart,
            RealtimeMetricsChart,
            BatteryChargeChart,
            CostChart
        ];
        
        chartClasses.forEach(ChartClass => {
            const chart = new ChartClass();
            this.charts.set(chart.chartId, chart);
        });
    }
    
    getAllCharts(): ChartProcessor[] {
        return Array.from(this.charts.values());
    }
    
    getChart(chartId: string): ChartProcessor | undefined {
        return this.charts.get(chartId);
    }
    
    getHistoricalCharts(): ChartProcessor[] {
        const historicalChartIds = [
            'mode-timeline',
            'battery-schedule',
            'grid-pricing',
            'power-flow',
            'solar-comparison',
            'estimated-cost'
        ];
        
        return historicalChartIds
            .map(id => this.charts.get(id))
            .filter((chart): chart is ChartProcessor => chart !== undefined);
    }
    
    getCurrentCharts(): ChartProcessor[] {
        const currentChartIds = [
            'charge',
            'realtime'
        ];
        
        return currentChartIds
            .map(id => this.charts.get(id))
            .filter((chart): chart is ChartProcessor => chart !== undefined);
    }
    
    initializeAllCharts(): void {
        this.charts.forEach(chart => {
            try {
                chart.initialize();
            } catch (error) {
                console.error(`Failed to initialize chart ${chart.chartId}:`, error);
            }
        });
    }
    
    destroyAllCharts(): void {
        this.charts.forEach(chart => {
            try {
                chart.destroy();
            } catch (error) {
                console.error(`Failed to destroy chart ${chart.chartId}:`, error);
            }
        });
    }
}