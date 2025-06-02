import { ChartRegistry, CostChart } from './charts';
import { MetricInstance } from '@shared';
import {FrontEndTimeSegment, Schedule} from './types/front-end-time-segment';
import {DataProcessor} from "./data-processor";

export class ChartManager {
    private readonly chartRegistry: ChartRegistry;
    private previousScheduleData: Schedule | null = null;
    private scheduleRowCache = new Map<string, HTMLTableRowElement>();
    private previousApplianceCostData: string | null = null;

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

        console.time('Updating appliance cost table');
        // Update appliance cost table
        this.updateApplianceCostTable(scheduleData);
        console.timeEnd('Updating appliance cost table');
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

        // Check if this is the first update or if schedule structure has changed
        if (!this.previousScheduleData) {
            console.log('📊 Schedule table: Full rebuild - first initialization');
            this.rebuildEntireTable(tableBody, scheduleData, metrics);
            this.previousScheduleData = this.cloneScheduleData(scheduleData);
            return;
        }
        
        if (this.hasScheduleStructureChanged(scheduleData)) {
            const reason = this.getStructureChangeReason(scheduleData);
            console.log(`📊 Schedule table: Full rebuild - ${reason}`);
            this.rebuildEntireTable(tableBody, scheduleData, metrics);
            this.previousScheduleData = this.cloneScheduleData(scheduleData);
            return;
        }

        // Perform differential update
        console.log('⚡ Schedule table: Differential update');
        this.performDifferentialUpdate(tableBody, scheduleData, metrics);
        this.previousScheduleData = this.cloneScheduleData(scheduleData);
    }

    private hasScheduleStructureChanged(newSchedule: Schedule): boolean {
        if (!this.previousScheduleData || this.previousScheduleData.length !== newSchedule.length) {
            return true;
        }

        // Check if segment time ranges have changed (structure change)
        for (let i = 0; i < newSchedule.length; i++) {
            const newSegment = newSchedule[i];
            const oldSegment = this.previousScheduleData[i];
            
            if (!newSegment || !oldSegment) {
                return true;
            }
            
            if (newSegment.time.segmentStart.epochMilliseconds !== oldSegment.time.segmentStart.epochMilliseconds ||
                newSegment.time.segmentEnd.epochMilliseconds !== oldSegment.time.segmentEnd.epochMilliseconds) {
                return true;
            }
        }

        return false;
    }

    private getStructureChangeReason(newSchedule: Schedule): string {
        if (!this.previousScheduleData) {
            return 'no previous data';
        }
        
        if (this.previousScheduleData.length !== newSchedule.length) {
            return `segment count changed (${this.previousScheduleData.length} → ${newSchedule.length})`;
        }

        // Check for time range changes
        for (let i = 0; i < newSchedule.length; i++) {
            const newSegment = newSchedule[i];
            const oldSegment = this.previousScheduleData[i];
            
            if (!newSegment || !oldSegment) {
                return `missing segment at index ${i}`;
            }
            
            if (newSegment.time.segmentStart.epochMilliseconds !== oldSegment.time.segmentStart.epochMilliseconds) {
                return `segment ${i} start time changed`;
            }
            
            if (newSegment.time.segmentEnd.epochMilliseconds !== oldSegment.time.segmentEnd.epochMilliseconds) {
                return `segment ${i} end time changed`;
            }
        }

        return 'unknown structure change';
    }

    private rebuildEntireTable(tableBody: HTMLElement, scheduleData: Schedule, metrics: MetricInstance[]): void {
        tableBody.innerHTML = '';
        this.scheduleRowCache.clear();

        scheduleData.forEach((segment) => {
            const row = this.createScheduleRow(segment, metrics);
            tableBody.appendChild(row);
        });
    }

    private performDifferentialUpdate(tableBody: HTMLElement, scheduleData: Schedule, metrics: MetricInstance[]): void {
        const currentTime = Date.now();
        
        scheduleData.forEach((segment, index) => {
            const segmentKey = this.getSegmentKey(segment);
            const existingRow = this.scheduleRowCache.get(segmentKey);
            
            if (!existingRow) {
                // New segment - create and insert row
                const newRow = this.createScheduleRow(segment, metrics);
                const nextSibling = tableBody.children[index] as HTMLElement;
                if (nextSibling) {
                    tableBody.insertBefore(newRow, nextSibling);
                } else {
                    tableBody.appendChild(newRow);
                }
                return;
            }

            // Check if segment data has changed or if current segment status changed
            const oldSegment = this.previousScheduleData![index];
            const segmentIsNow = segment.time.segmentStart.epochMilliseconds <= currentTime &&
                                segment.time.segmentEnd.epochMilliseconds >= currentTime;
            const segmentIsPast = segment.time.segmentEnd.epochMilliseconds < currentTime;
            const wasCurrentSegment = existingRow.classList.contains('current-segment');
            const wasPastSegment = existingRow.classList.contains('past-segment');

            // Update if data changed or time status changed
            if (this.hasSegmentDataChanged(segment, oldSegment) ||
                segmentIsNow !== wasCurrentSegment ||
                segmentIsPast !== wasPastSegment) {
                this.updateExistingRow(existingRow, segment, metrics, segmentIsNow);
            }
        });

        // Remove any extra rows if schedule got shorter
        while (tableBody.children.length > scheduleData.length) {
            const lastChild = tableBody.lastElementChild;
            if (lastChild) {
                tableBody.removeChild(lastChild);
            }
        }
    }

    private createScheduleRow(segment: FrontEndTimeSegment, metrics: MetricInstance[]): HTMLTableRowElement {
        const row = document.createElement('tr');
        const segmentKey = this.getSegmentKey(segment);
        
        const startTime = segment.time.segmentStart.toZonedDateTimeISO('Europe/London');
        const endTime = segment.time.segmentEnd.toZonedDateTimeISO('Europe/London');
        const timePeriod = `${startTime.toPlainTime().toString().slice(0, 5)} - ${endTime.toPlainTime().toString().slice(0, 5)}`;
        
        const modeClass = this.getModeClass(segment.mode);
        const modeDisplay = this.getModeDisplayName(segment.mode);
        const currentTime = Date.now();
        const segmentIsNow = segment.time.segmentStart.epochMilliseconds <= currentTime &&
                            segment.time.segmentEnd.epochMilliseconds >= currentTime;
        const segmentIsPast = segment.time.segmentEnd.epochMilliseconds < currentTime;
        
        // Apply time-based styling
        if (segmentIsNow) {
            row.classList.add('current-segment');
        } else if (segmentIsPast) {
            row.classList.add('past-segment');
        }

        const actualValues = this.getActualValuesForSegment(segment, metrics);
        
        row.innerHTML = `
            <td class="time-cell">${timePeriod}</td>
            <td class="mode-cell ${modeClass}">${modeDisplay}</td>
            <td class="number-cell">£${segment.gridPrice.toFixed(3)}</td>
            <td class="number-cell">${this.formatComparisonValue(segment.expectedSolarGeneration, actualValues.avgSolar, 'solar')}</td>
            <td class="number-cell">${this.formatComparisonValue(segment.expectedConsumption, actualValues.avgLoad, 'load')}</td>
            <td class="number-cell">${this.formatComparisonValue(segment.startBatteryChargeKwh, actualValues.startBattery, 'start-battery')}</td>
            <td class="number-cell">${this.formatComparisonValue(segment.endBatteryChargeKwh, actualValues.endBattery, 'end-battery')}</td>
            <td class="number-cell">${this.formatComparisonValue(segment.actualGridUsage, actualValues.avgGridUsage, 'grid')}</td>
            <td class="number-cell">${segment.wastedSolarGeneration.toFixed(2)}</td>
            <td class="cost-cell">${this.formatComparisonValue(segment.cost, actualValues.actualCost, 'cost')}</td>
        `;
        
        this.scheduleRowCache.set(segmentKey, row);
        return row;
    }

    private updateExistingRow(row: HTMLTableRowElement, segment: any, metrics: MetricInstance[], segmentIsNow: boolean): void {
        const currentTime = Date.now();
        const segmentIsPast = segment.time.segmentEnd.epochMilliseconds < currentTime;
        
        // Update time-based styling
        row.classList.remove('current-segment', 'past-segment');
        if (segmentIsNow) {
            row.classList.add('current-segment');
        } else if (segmentIsPast) {
            row.classList.add('past-segment');
        }

        const actualValues = this.getActualValuesForSegment(segment, metrics);
        const cells = row.children;

        // Update only the cells that might change (skip time and mode which are structural)
        if (cells[2]) cells[2].textContent = `£${segment.gridPrice.toFixed(3)}`;
        if (cells[3]) cells[3].innerHTML = this.formatComparisonValue(segment.expectedSolarGeneration, actualValues.avgSolar, 'solar');
        if (cells[4]) cells[4].innerHTML = this.formatComparisonValue(segment.expectedConsumption, actualValues.avgLoad, 'load');
        if (cells[5]) cells[5].innerHTML = this.formatComparisonValue(segment.startBatteryChargeKwh, actualValues.startBattery, 'start-battery');
        if (cells[6]) cells[6].innerHTML = this.formatComparisonValue(segment.endBatteryChargeKwh, actualValues.endBattery, 'end-battery');
        if (cells[7]) cells[7].innerHTML = this.formatComparisonValue(segment.actualGridUsage, actualValues.avgGridUsage, 'grid');
        if (cells[8]) cells[8].textContent = segment.wastedSolarGeneration.toFixed(2);
        if (cells[9]) cells[9].innerHTML = this.formatComparisonValue(segment.cost, actualValues.actualCost, 'cost');
    }

    private hasSegmentDataChanged(newSegment: any, oldSegment: any): boolean {
        return (
            newSegment.mode !== oldSegment.mode ||
            newSegment.gridPrice !== oldSegment.gridPrice ||
            newSegment.expectedSolarGeneration !== oldSegment.expectedSolarGeneration ||
            newSegment.expectedConsumption !== oldSegment.expectedConsumption ||
            newSegment.startBatteryChargeKwh !== oldSegment.startBatteryChargeKwh ||
            newSegment.endBatteryChargeKwh !== oldSegment.endBatteryChargeKwh ||
            newSegment.actualGridUsage !== oldSegment.actualGridUsage ||
            newSegment.wastedSolarGeneration !== oldSegment.wastedSolarGeneration ||
            newSegment.cost !== oldSegment.cost
        );
    }

    private getSegmentKey(segment: any): string {
        return `${segment.time.segmentStart.epochMilliseconds}-${segment.time.segmentEnd.epochMilliseconds}`;
    }

    private cloneScheduleData(scheduleData: Schedule): Schedule {
        return scheduleData.map(segment => ({ ...segment }));
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
        avgLoad: number | null;
        startBattery: number | null;
        endBattery: number | null;
        actualCost: number | null;
    } {
        const startMs = segment.time.segmentStart.epochMilliseconds;
        const endMs = segment.time.segmentEnd.epochMilliseconds;
        
        // Use optimized binary search to find metrics within the segment time range
        const timeRange = this.dataProcessor.findMetricsInTimeRange(metrics, startMs, endMs);
        const segmentMetrics = timeRange.metrics;

        if (segmentMetrics.length === 0) {
            return {
                avgSolar: null,
                avgGridUsage: null,
                avgLoad: null,
                startBattery: null,
                endBattery: null,
                actualCost: null
            };
        }

        // Calculate averages for solar, grid usage, and load
        const avgSolar = segmentMetrics.reduce((sum, m) => sum + m.solarPower, 0) / segmentMetrics.length;
        const avgGridUsage = segmentMetrics.reduce((sum, m) => sum + Math.abs(m.gridPower), 0) / segmentMetrics.length;
        const avgLoad = segmentMetrics.reduce((sum, m) => sum + m.loadPower, 0) / segmentMetrics.length;

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
            avgLoad: avgLoad / 1000, // Convert W to kW, then assume 30min segments for kWh
            startBattery,
            endBattery,
            actualCost
        };
    }

    private findClosestMetric(metrics: MetricInstance[], targetTime: number): MetricInstance | null {
        if (metrics.length === 0) return null;
        
        // Use the optimized binary search from data processor
        const index = this.dataProcessor.findMetricIndexByTimestamp(metrics, targetTime);
        return index !== -1 ? metrics[index] || null : null;
    }

    private formatComparisonValue(expected: number, actual: number | null, type: string): string {
        if (actual === null) {
            return type === 'cost' ? `£${expected.toFixed(3)}` : expected.toFixed(2);
        }

        const difference = actual - expected;
        const percentChange = expected !== 0 ? (difference / expected) * 100 : 0;
        
        // Use multiplier format if percentage is over 200% or under -50%
        let changeStr: string;
        if (Math.abs(percentChange) > 200) {
            const multiplier = expected !== 0 ? actual / expected : 0;
            changeStr = `${multiplier.toFixed(1)}×`;
        } else {
            changeStr = percentChange >= 0 ? `+${percentChange.toFixed(0)}%` : `${percentChange.toFixed(0)}%`;
        }
        
        // Determine if positive change is good for this metric type
        const positiveGood = this.isPositiveChangeGood(type);
        const colorClass = this.getComparisonColorClass(difference, positiveGood);
        
        if (type === 'cost') {
            return `<span class="comparison-value">
                <span class="expected-value">£${expected.toFixed(3)}</span>
                <span class="actual-value"> - £${actual.toFixed(3)}</span>
                <span class="percentage-change ${colorClass}"> (${changeStr})</span>
            </span>`;
        }
        
        return `<span class="comparison-value">
            <span class="expected-value">${expected.toFixed(2)}</span>
            <span class="actual-value"> - ${actual.toFixed(2)}</span>
            <span class="percentage-change ${colorClass}"> (${changeStr})</span>
        </span>`;
    }

    private isPositiveChangeGood(type: string): boolean {
        switch (type) {
            case 'solar':
            case 'start-battery':
            case 'end-battery':
                return true; // More solar/battery is good
            case 'grid':
            case 'load':
            case 'cost':
                return false; // More grid usage/load/cost is bad
            default:
                return false;
        }
    }

    private getComparisonColorClass(difference: number, positiveGood: boolean): string {
        const isPositive = difference > 0;
        
        if (positiveGood) {
            return isPositive ? 'positive-change' : 'negative-change';
        } else {
            return isPositive ? 'negative-change' : 'positive-change';
        }
    }

    private updateApplianceCostTable(scheduleData: Schedule): void {
        const tableBody = document.getElementById('appliance-cost-table-body');
        if (!tableBody) return;

        // Create a hash of the schedule data to check if it has changed
        const scheduleHash = this.createScheduleHash(scheduleData);
        
        // Skip update if data hasn't changed
        if (this.previousApplianceCostData === scheduleHash) {
            return;
        }

        console.log('📊 Appliance cost table: Data changed, updating...');

        // Calculate cost for 1.5kWh over 1.5 hours for each segment
        const costData = scheduleData.map(segment => {
            const startTime = segment.time.segmentStart.toZonedDateTimeISO('Europe/London');
            
            // Calculate average cost per kWh over 1.5 hours starting from this segment
            let totalCost = 0;
            let totalHours = 0;
            const targetHours = 1.5;
            const targetKwh = 1.5;
            
            // Find segments that overlap with the 1.5 hour window
            const windowEndTime = segment.time.segmentStart.epochMilliseconds + (targetHours * 60 * 60 * 1000);
            
            for (const checkSegment of scheduleData) {
                const checkStart = checkSegment.time.segmentStart.epochMilliseconds;
                const checkEnd = checkSegment.time.segmentEnd.epochMilliseconds;
                
                // Check if this segment overlaps with our 1.5 hour window
                if (checkStart < windowEndTime && checkEnd > segment.time.segmentStart.epochMilliseconds) {
                    const overlapStart = Math.max(checkStart, segment.time.segmentStart.epochMilliseconds);
                    const overlapEnd = Math.min(checkEnd, windowEndTime);
                    const overlapHours = (overlapEnd - overlapStart) / (1000 * 60 * 60);
                    
                    if (overlapHours > 0) {
                        totalCost += (checkSegment.gridPrice) * overlapHours * (targetKwh / targetHours); // Convert pence to pounds
                        totalHours += overlapHours;
                    }
                }
                
                if (totalHours >= targetHours) break;
            }
            
            // If we don't have enough segments to cover 1.5 hours, use the last available price
            if (totalHours < targetHours && totalHours > 0 && scheduleData.length > 0) {
                const lastSegment = scheduleData[scheduleData.length - 1];
                if (lastSegment) {
                    const remainingHours = targetHours - totalHours;
                    totalCost += (lastSegment.gridPrice) * remainingHours * (targetKwh / targetHours);
                }
            }
            
            return {
                startTime: startTime.toPlainTime().toString().slice(0, 5),
                cost: totalCost,
                timestamp: segment.time.segmentStart.epochMilliseconds
            };
        });

        // Sort by reverse chronological order (latest time first)
        costData.sort((a, b) => b.timestamp - a.timestamp);

        // Calculate mean and percentiles for color coding
        const costs = costData.map(item => item.cost);
        const meanCost = costs.reduce((sum, cost) => sum + cost, 0) / costs.length;
        const threshold25 = meanCost * 0.25;
        const threshold50 = meanCost * 0.50;
        const threshold75 = meanCost * 0.75;

        // Clear existing rows
        tableBody.innerHTML = '';

        // Add rows for each segment
        costData.forEach(item => {
            const row = document.createElement('tr');
            
            // Determine color class and emoji based on cost relative to mean
            let colorClass = '';
            let emoji = '';
            
            if (item.cost <= threshold25) {
                colorClass = 'cost-excellent';
                emoji = '🥳'; // Happy face
            } else if (item.cost <= threshold50) {
                colorClass = 'cost-good';
                emoji = '😊'; // Happy face
            } else if (item.cost <= threshold75) {
                colorClass = 'cost-average';
                emoji = '😐'; // Neutral face
            } else {
                colorClass = 'cost-expensive';
                emoji = '😢'; // Sad face
            }
            
            row.innerHTML = `
                <td class="time-cell">${item.startTime}</td>
                <td class="cost-cell ${colorClass}">£${item.cost.toFixed(2)}</td>
                <td class="emoji-cell">${emoji}</td>
            `;
            tableBody.appendChild(row);
        });

        // Update the cache with the new hash
        this.previousApplianceCostData = scheduleHash;
    }

    private createScheduleHash(scheduleData: Schedule): string {
        // Create a hash based on relevant schedule data for appliance cost calculation
        return scheduleData.map(segment =>
            `${segment.time.segmentStart.epochMilliseconds}-${segment.time.segmentEnd.epochMilliseconds}-${segment.gridPrice}`
        ).join('|');
    }
}
