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

        const chartData = {
            planned: plannedMode.sort((a, b) => (a.x) - (b.x)),
            actual: dedupedModes.sort((a, b) => (a.x) - (b.x))
        };

        console.log(`Processed MODE timeline data: Planned segments: ${chartData.planned.length}, Actual segments: ${chartData.actual.length}`);
        return chartData;
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

        return data.sort((a, b) => (a.x) - (b.x));
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

    processSolarComparisonData(scheduleData: Schedule, metrics: MetricInstance[]): { actual: ChartDataPoint[], scheduled: ChartDataPoint[] } {
        if (!Array.isArray(scheduleData) || !Array.isArray(metrics)) {
            return { actual: [], scheduled: [] };
        }

        // Process actual solar power from metrics (convert from W to kW)
        const actualSolarData: ChartDataPoint[] = metrics.map(metric => ({
            x: metric.timestamp,
            y: metric.solarPower / 1000 // Convert W to kW
        }));

        // Process scheduled solar power from schedule data
        const scheduledSolarData: ChartDataPoint[] = [];
        scheduleData.forEach(segment => {
            const startTime = segment.time.segmentStart.epochMilliseconds;
            const endTime = segment.time.segmentEnd.epochMilliseconds;
            
            const solarKw = segment.expectedSolarGeneration * 2;

            let midPoint = startTime + (endTime - startTime);
            scheduledSolarData.push({ x: midPoint, y: solarKw });
        });

        return {
            actual: actualSolarData.sort((a, b) => (a.x as number) - (b.x as number)),
            scheduled: scheduledSolarData.sort((a, b) => (a.x as number) - (b.x as number))
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

    calculateCost(metrics: MetricInstance[], schedule: Schedule): number {
        // loop through metrics, calculate cost between each metric by time diff then multiple by grid price
        if (!Array.isArray(metrics) || metrics.length === 0) return 0;
        let totalCost = 0;
        for (let i = 0; i < metrics.length - 1; i++) {
            const segment = schedule.find(s => s.time.segmentStart.epochMilliseconds <= metrics[i]!.timestamp && s.time.segmentEnd.epochMilliseconds > metrics[i]!.timestamp);
            if(!segment) {
                console.warn(`No schedule segment found for metric at ${metrics[i]!.timestamp}`);
                return -1;
            }

            const current = metrics[i]!;
            const next = metrics[i + 1]!;
            const timeDiff = next.timestamp - current.timestamp;
            const cost = (timeDiff / (1000 * 60 * 60)) * segment.gridPrice;
            totalCost += cost;
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
