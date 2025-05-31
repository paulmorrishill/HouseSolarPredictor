import { Temporal } from '@js-temporal/polyfill';
import { ChartDataPoint } from './types';
import {MetricInstance, MetricList} from "@shared";
import {Schedule} from "./types/front-end-time-segment";

const MODE_CHARGE_FROM_GRID_AND_SOLAR = 3;
const MODE_CHARGE_SOLAR_ONLY = 2;
const MODE_DISCHARGE = 1;

interface ModeTimelineData {
    planned: ChartDataPoint[];
    actual: ChartDataPoint[];
}

interface PowerFlowData {
    load: ChartDataPoint[];
    grid: ChartDataPoint[];
    solar: ChartDataPoint[];
}

export class DataProcessor {
    constructor() {
        // No dependencies needed for data processing
    }

    filterMetricsByTimeRange(metrics: MetricList, hours: number, selectedDate: Temporal.PlainDate): MetricList {
        if (!Array.isArray(metrics) || metrics.length === 0) {
            return [];
        }

        // Convert PlainDate to end of day in London timezone
        const endOfDay = selectedDate.toZonedDateTime({
            timeZone: 'Europe/London',
            plainTime: Temporal.PlainTime.from('23:59:59.999')
        });
        
        const endTime = endOfDay.epochMilliseconds;
        const cutoffTime = endTime - (hours * 60 * 60 * 1000);

        return metrics.filter(metric => {
            const timestamp = metric.timestamp;
            return timestamp >= cutoffTime && timestamp <= endTime;
        });
    }

    limitDataPoints(metrics: MetricInstance[], maxPoints: number): MetricInstance[] {
        if (!Array.isArray(metrics) || metrics.length <= maxPoints) {
            return metrics;
        }

        // Calculate step size to evenly distribute data points
        const step = Math.ceil(metrics.length / maxPoints);
        const limitedMetrics: MetricInstance[] = [];
        
        for (let i = 0; i < metrics.length; i += step) {
            const metric = metrics[i];
            if (metric) {
                limitedMetrics.push(metric);
            }
        }
        
        // Always include the last data point
        const lastMetric = metrics[metrics.length - 1];
        if (lastMetric && limitedMetrics[limitedMetrics.length - 1] !== lastMetric) {
            limitedMetrics.push(lastMetric);
        }
        
        return limitedMetrics;
    }

    processModeTimelineData(scheduleData: Schedule, historicData: MetricInstance[]): ModeTimelineData {
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

        // Add the last point of now with the same mode
        if (actualModes.length > 0) {
            const lastMode = actualModes[actualModes.length - 1];
            if (lastMode) {
                actualModes.push({ x: Temporal.Now.instant().epochMilliseconds, y: lastMode.y });
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

        return {
            planned: plannedMode.sort((a, b) => (a.x as number) - (b.x as number)),
            actual: dedupedModes.sort((a, b) => (a.x as number) - (b.x as number))
        };
    }

    processBatteryScheduleData(scheduleData: Schedule): ChartDataPoint[] {
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

        return data.sort((a, b) => (a.x as number) - (b.x as number));
    }

    processGridPricingData(scheduleData: Schedule): ChartDataPoint[] {
        if (!Array.isArray(scheduleData)) return [];

        const data: ChartDataPoint[] = [];
        scheduleData.forEach((segment, i) => {
            const startTime = segment.time.segmentStart;
            const endTime = segment.time.segmentEnd;
            const priceInPounds = segment.gridPrice;

            data.push({ x: startTime.epochMilliseconds, y: priceInPounds });
            if (i < scheduleData.length - 1) {
                // Add a point at the end of the segment to maintain the price until the next segment
                data.push({ x: endTime.epochMilliseconds, y: priceInPounds });
            }
        });

        return data.sort((a, b) => (a.x as number) - (b.x as number));
    }

    processPowerFlowData(scheduleData: Schedule): PowerFlowData {
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

        // remove duplicate points
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
                return MODE_CHARGE_FROM_GRID_AND_SOLAR; // Battery first with high charge rate
            } else {
                return MODE_CHARGE_SOLAR_ONLY; // Battery first with low charge rate
            }
        }
        if (metric.workModePriority === 'Load first') {
            return MODE_DISCHARGE;
        }

        throw new Error('Unknown work mode priority: ' + metric.workModePriority);
    }

    getExpectedBatteryLevel(timestamp: number, schedule: Schedule): number | null {
        if (!Array.isArray(schedule)) return null;

        for (const block of schedule) {
            const startTime = block.time.segmentStart.epochMilliseconds;
            const endTime = block.time.segmentEnd.epochMilliseconds;

            if (timestamp >= startTime && timestamp < endTime) {
                // Linear interpolation between start and end battery levels
                const segmentDuration = endTime - startTime;
                const elapsed = timestamp - startTime;
                const progress = segmentDuration > 0 ? elapsed / segmentDuration : 0;

                const interpolatedLevel = block.startBatteryChargeKwh +
                       (block.endBatteryChargeKwh - block.startBatteryChargeKwh) * progress;
                return Math.max(0, Math.min(10, interpolatedLevel));
            }
        }

        return null;
    }

    // DateTime utility methods - using Temporal
    formatDateTime(dateTime: number | string): string {
        const instant = typeof dateTime === 'number'
            ? Temporal.Instant.fromEpochMilliseconds(dateTime)
            : Temporal.ZonedDateTime.from(dateTime).toInstant();
        
        const londonTime = instant.toZonedDateTimeISO('Europe/London');
        return londonTime.toLocaleString();
    }

    formatTimeOnly(dateTime: number | string): string {
        const instant = typeof dateTime === 'number'
            ? Temporal.Instant.fromEpochMilliseconds(dateTime)
            : Temporal.ZonedDateTime.from(dateTime).toInstant();
        
        const londonTime = instant.toZonedDateTimeISO('Europe/London');
        return londonTime.toPlainTime().toLocaleString();
    }

    formatDateOnly(dateTime: number | string): string {
        const instant = typeof dateTime === 'number'
            ? Temporal.Instant.fromEpochMilliseconds(dateTime)
            : Temporal.ZonedDateTime.from(dateTime).toInstant();
        
        const londonTime = instant.toZonedDateTimeISO('Europe/London');
        return londonTime.toPlainDate().toLocaleString();
    }

    isDateTimeInRange(targetDateTime: number | string, startDateTime: number | string, endDateTime: number | string): boolean {
        const target = typeof targetDateTime === 'number'
            ? Temporal.Instant.fromEpochMilliseconds(targetDateTime)
            : Temporal.ZonedDateTime.from(targetDateTime).toInstant();
        
        const start = typeof startDateTime === 'number'
            ? Temporal.Instant.fromEpochMilliseconds(startDateTime)
            : Temporal.ZonedDateTime.from(startDateTime).toInstant();
        
        const end = typeof endDateTime === 'number'
            ? Temporal.Instant.fromEpochMilliseconds(endDateTime)
            : Temporal.ZonedDateTime.from(endDateTime).toInstant();
        
        return Temporal.Instant.compare(target, start) >= 0 && Temporal.Instant.compare(target, end) < 0;
    }

    calculateCost(metrics: MetricInstance[]): number {
        // Simple cost calculation - just show a reasonable daily estimate
        let totalCost = 0;
        
        if (Array.isArray(metrics) && metrics.length > 0) {
            // Get the most recent metric for current power usage
            const latestMetric = metrics[metrics.length - 1] || metrics[0];
            
            if (latestMetric) {
                // Convert watts to kilowatts
                const currentGridUsageKw = Math.max(0, (latestMetric.gridPower || 0) / 1000);
                const avgPrice = 0.25; // £0.25 per kWh
                
                // Estimate daily cost based on current usage
                // Assume current usage continues for 24 hours
                totalCost = currentGridUsageKw * 24 * avgPrice;
                
                // Cap at reasonable maximum
                totalCost = Math.min(totalCost, 50.00);
            }
        }

        return totalCost;
    }

    formatModeName(mode: string): string {
        switch (mode) {
            case 'ChargeSolarOnly':
                return 'Charge Solar Only';
            case 'ChargeFromGridAndSolar':
                return 'Charge Grid + Solar';
            case 'Discharge':
                return 'Discharge';
            default:
                return mode || '-';
        }
    }

    formatMode(mode: string): string {
        switch (mode) {
            case 'ChargeFromGridAndSolar':
                return 'Charge (Grid + Solar)';
            case 'ChargeSolarOnly':
                return 'Charge (Solar Only)';
            case 'Discharge':
                return 'Discharge';
            default:
                return mode;
        }
    }
}
