import { Temporal } from '@js-temporal/polyfill';
import {MetricInstance, MetricList} from "@shared";
import {Schedule} from "./types/front-end-time-segment";

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
        console.time(`Limiting data points to ${maxPoints}`);
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

        console.timeEnd(`Limiting data points to ${maxPoints}`);
        return limitedMetrics;
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
        if (!Array.isArray(schedule) || schedule.length === 0) return 0;
        
        let totalCost = 0;
        let scheduleIndex = 0; // Track current position in schedule
        
        for (let i = 0; i < metrics.length - 1; i++) {
            const timestamp = metrics[i]!.timestamp;
            
            // Since both arrays are ordered ascending, advance schedule index if needed
            while (scheduleIndex < schedule.length &&
                   schedule[scheduleIndex]!.time.segmentEnd.epochMilliseconds <= timestamp) {
                scheduleIndex++;
            }
            
            // Check if current schedule segment contains this timestamp
            if (scheduleIndex >= schedule.length ||
                timestamp < schedule[scheduleIndex]!.time.segmentStart.epochMilliseconds) {
                console.warn(`No schedule segment found for metric at ${timestamp}`);
                return -1;
            }
            
            const segment = schedule[scheduleIndex]!;
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
