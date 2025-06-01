import { ChartRegistry, CostChart } from './charts';
import { MetricInstance } from '@shared';
import { Schedule } from './types/front-end-time-segment';
import {DataProcessor} from "./data-processor";

export class ChartManager {
    private readonly chartRegistry: ChartRegistry;

    constructor(private dataProcessor: DataProcessor) {
        this.chartRegistry = new ChartRegistry();
    }

    initializeCharts(): void {
        console.log('📊 Initializing Chart.js charts...', 'info');
        
        try {
            this.chartRegistry.initializeAllCharts();
            console.log('✅ All charts initialized successfully', 'info');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.log(`❌ Chart initialization failed: ${errorMessage}`, 'error');
            throw error;
        }
    }

    updateHistoricCharts(scheduleData: Schedule, metrics: MetricInstance[]): void {
        if (!this.shouldUpdateCharts()) {
            console.warn('Chart update throttled - skipping update');
            return;
        }

        const historicalCharts = this.chartRegistry.getHistoricalCharts();
        const limitedHistoricMetrics = this.dataProcessor.limitDataPoints(metrics, 1000);

        historicalCharts.forEach(chart => {
            try {
                console.time(`Updating chart ${chart.chartId}`);
                chart.processData(limitedHistoricMetrics, scheduleData);
                chart.updateChart();
                console.timeEnd(`Updating chart ${chart.chartId}`);
            } catch (error) {
                console.error(`Failed to update chart ${chart.chartId}:`, error);
            }
        });

        console.time('Updating schedule table');
        // Update schedule table with metrics for comparison
        this.updateScheduleTable(scheduleData, metrics);
        console.timeEnd('Updating schedule table');
    }

    updateCurrentCharts(limitedCurrentMetrics: MetricInstance[], currentSchedule: Schedule): void {
        if (!this.shouldUpdateCharts()) return;

        const currentCharts = this.chartRegistry.getCurrentCharts();
        
        currentCharts.forEach(chart => {
            try {
                chart.processData(limitedCurrentMetrics, currentSchedule);
                chart.updateChart();
            } catch (error) {
                console.error(`Failed to update chart ${chart.chartId}:`, error);
            }
        });
    }

    updateCostChart(totalCost: number): void {
        const costChart = this.chartRegistry.getChart('cost') as CostChart;
        if (costChart) {
            costChart.updateCost(totalCost);
        }
    }

    shouldUpdateCharts(): boolean {
        return true;
    }

    destroy(): void {
        this.chartRegistry.destroyAllCharts();
    }

    // Legacy methods for backward compatibility
    updateMetricsChart(metrics: MetricInstance[]): void {
        const realtimeChart = this.chartRegistry.getChart('realtime');
        if (realtimeChart) {
            realtimeChart.processData(metrics, []);
            realtimeChart.updateChart();
        }
    }

    updateExpectedVsActualBatteryChargeChart(metrics: MetricInstance[], schedule: Schedule): void {
        const chargeChart = this.chartRegistry.getChart('charge');
        if (chargeChart) {
            chargeChart.processData(metrics, schedule);
            chargeChart.updateChart();
        }
    }

    private updateScheduleTable(scheduleData: Schedule, metrics: MetricInstance[]): void {
        const tableBody = document.getElementById('schedule-table-body');
        if (!tableBody) return;

        tableBody.innerHTML = '';

        scheduleData.forEach((segment) => {
            const row = document.createElement('tr');
            
            const startTime = segment.time.segmentStart.toZonedDateTimeISO('Europe/London');
            const endTime = segment.time.segmentEnd.toZonedDateTimeISO('Europe/London');
            const timePeriod = `${startTime.toPlainTime().toString().slice(0, 5)} - ${endTime.toPlainTime().toString().slice(0, 5)}`;
            
            const modeClass = this.getModeClass(segment.mode);
            const modeDisplay = this.getModeDisplayName(segment.mode);
            const segmentIsNow = segment.time.segmentStart.epochMilliseconds <= Date.now() && segment.time.segmentEnd.epochMilliseconds >= Date.now();
            if (segmentIsNow) {
                row.classList.add('current-segment');
            }

            // Get actual values from metrics for this time segment
            const actualValues = this.getActualValuesForSegment(segment, metrics);
            
            row.innerHTML = `
                <td class="time-cell">${timePeriod}</td>
                <td class="mode-cell ${modeClass}">${modeDisplay}</td>
                <td class="number-cell">£${segment.gridPrice.toFixed(3)}</td>
                <td class="number-cell">${this.formatComparisonValue(segment.expectedSolarGeneration, actualValues.avgSolar, 'solar')}</td>
                <td class="number-cell">${segment.expectedConsumption.toFixed(2)}</td>
                <td class="number-cell">${this.formatComparisonValue(segment.startBatteryChargeKwh, actualValues.startBattery, 'start-battery')}</td>
                <td class="number-cell">${this.formatComparisonValue(segment.endBatteryChargeKwh, actualValues.endBattery, 'end-battery')}</td>
                <td class="number-cell">${this.formatComparisonValue(segment.actualGridUsage, actualValues.avgGridUsage, 'grid')}</td>
                <td class="number-cell">${segment.wastedSolarGeneration.toFixed(2)}</td>
                <td class="cost-cell">${this.formatComparisonValue(segment.cost, actualValues.actualCost, 'cost')}</td>
            `;
            
            tableBody.appendChild(row);
        });
    }

    private getModeClass(mode: string): string {
        switch (mode) {
            case 'Discharge':
                return 'mode-discharge';
            case 'ChargeSolarOnly':
                return 'mode-solar-only';
            case 'ChargeFromGridAndSolar':
                return 'mode-grid-solar';
            default:
                return '';
        }
    }

    private getModeDisplayName(mode: string): string {
        switch (mode) {
            case 'Discharge':
                return 'Discharge';
            case 'ChargeSolarOnly':
                return 'Solar Only';
            case 'ChargeFromGridAndSolar':
                return 'Grid + Solar';
            default:
                return mode;
        }
    }

    private getActualValuesForSegment(segment: any, metrics: MetricInstance[]): {
        avgSolar: number | null;
        avgGridUsage: number | null;
        startBattery: number | null;
        endBattery: number | null;
        actualCost: number | null;
    } {
        const startMs = segment.time.segmentStart.epochMilliseconds;
        const endMs = segment.time.segmentEnd.epochMilliseconds;
        
        // Filter metrics within the segment time range
        const segmentMetrics = metrics.filter(metric =>
            metric.timestamp >= startMs && metric.timestamp <= endMs
        );

        if (segmentMetrics.length === 0) {
            return {
                avgSolar: null,
                avgGridUsage: null,
                startBattery: null,
                endBattery: null,
                actualCost: null
            };
        }

        // Calculate averages for solar and grid usage
        const avgSolar = segmentMetrics.reduce((sum, m) => sum + m.solarPower, 0) / segmentMetrics.length;
        const avgGridUsage = segmentMetrics.reduce((sum, m) => sum + Math.abs(m.gridPower), 0) / segmentMetrics.length;

        // Find closest metrics to start and end times for battery values
        const startBatteryMetric = this.findClosestMetric(segmentMetrics, startMs);
        const endBatteryMetric = this.findClosestMetric(segmentMetrics, endMs);

        // Convert battery percentage to kWh
        const startBattery = startBatteryMetric ?
            (startBatteryMetric.batteryChargePercent / 100) * startBatteryMetric.batteryCapacity : null;
        const endBattery = endBatteryMetric ?
            (endBatteryMetric.batteryChargePercent / 100) * endBatteryMetric.batteryCapacity : null;

        // Calculate actual cost based on actual grid usage and grid price
        const avgGridUsageKwh = avgGridUsage / 1000; // Convert W to kWh for 30min segments
        const actualCost = avgGridUsageKwh * segment.gridPrice;

        return {
            avgSolar: avgSolar / 1000, // Convert W to kW, then assume 30min segments for kWh
            avgGridUsage: avgGridUsageKwh,
            startBattery,
            endBattery,
            actualCost
        };
    }

    private findClosestMetric(metrics: MetricInstance[], targetTime: number): MetricInstance | null {
        if (metrics.length === 0) return null;
        
        return metrics.reduce((closest, current) => {
            const currentDiff = Math.abs(current.timestamp - targetTime);
            const closestDiff = Math.abs(closest.timestamp - targetTime);
            return currentDiff < closestDiff ? current : closest;
        });
    }

    private formatComparisonValue(expected: number, actual: number | null, type: string): string {
        if (actual === null) {
            return type === 'cost' ? `£${expected.toFixed(3)}` : expected.toFixed(2);
        }

        const difference = actual - expected;
        const percentChange = expected !== 0 ? (difference / expected) * 100 : 0;
        const percentStr = percentChange >= 0 ? `+${percentChange.toFixed(0)}%` : `${percentChange.toFixed(0)}%`;
        
        const colorClass = this.getComparisonColorClass(difference, type);
        
        if (type === 'cost') {
            return `<span class="comparison-value">
                <span class="expected-value">£${expected.toFixed(3)}</span>
                <span class="actual-value"> - £${actual.toFixed(3)}</span>
                <span class="percentage-change ${colorClass}"> (${percentStr})</span>
            </span>`;
        }
        
        return `<span class="comparison-value">
            <span class="expected-value">${expected.toFixed(2)}</span>
            <span class="actual-value"> - ${actual.toFixed(2)}</span>
            <span class="percentage-change ${colorClass}"> (${percentStr})</span>
        </span>`;
    }

    private getComparisonColorClass(difference: number, type: string): string {
        const isPositive = difference > 0;
        
        switch (type) {
            case 'grid':
                return isPositive ? 'negative-change' : 'positive-change'; // + grid usage is bad (red), - is good (green)
            case 'solar':
                return isPositive ? 'positive-change' : 'negative-change'; // + solar is good (green), - is bad (red)
            case 'start-battery':
                return isPositive ? 'positive-change' : 'negative-change'; // + battery is good (green), - is bad (red)
            case 'end-battery':
                return isPositive ? 'positive-change' : 'negative-change'; // + battery is good (green), - is bad (red)
            case 'cost':
                return isPositive ? 'negative-change' : 'positive-change'; // + cost is bad (red), - cost is good (green)
            default:
                return '';
        }
    }
}
