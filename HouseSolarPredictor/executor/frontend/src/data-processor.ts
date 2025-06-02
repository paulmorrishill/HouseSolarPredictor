import { Temporal } from '@js-temporal/polyfill';
import {MetricInstance, MetricList} from "@shared";
import {Schedule} from "./types/front-end-time-segment";

export class DataProcessor {
    private lastCostCalculation: {
        totalCost: number;
        lastProcessedIndex: number;
        lastMetricTimestamp: number;
    } | null = null;
    
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
        if (!Array.isArray(metrics) || metrics.length === 0) return 0;
        if (!Array.isArray(schedule) || schedule.length === 0) return 0;
        
        // Check if we can use incremental calculation
        if (this.lastCostCalculation && metrics.length > 0) {
            const lastMetric = metrics[metrics.length - 1];
            if (lastMetric && lastMetric.timestamp === this.lastCostCalculation.lastMetricTimestamp) {
                // No new metrics, return cached result
                return this.lastCostCalculation.totalCost;
            }
            
            // Find where to start incremental calculation
            const startIndex = this.findIncrementalStartIndex(metrics);
            if (startIndex !== -1) {
                return this.calculateIncrementalCost(metrics, schedule, startIndex);
            }
        }
        
        // Full calculation for first time or when incremental fails
        return this.calculateFullCost(metrics, schedule);
    }
    
    private findIncrementalStartIndex(metrics: MetricInstance[]): number {
        if (!this.lastCostCalculation) return -1;
        
        // Find the index where we left off
        for (let i = this.lastCostCalculation.lastProcessedIndex; i < metrics.length; i++) {
            const metric = metrics[i];
            if (metric && metric.timestamp > this.lastCostCalculation.lastMetricTimestamp) {
                return Math.max(0, i - 1); // Start from previous metric to ensure continuity
            }
        }
        
        return -1;
    }
    
    private calculateIncrementalCost(metrics: MetricInstance[], schedule: Schedule, startIndex: number): number {
        let totalCost = this.lastCostCalculation!.totalCost;
        
        for (let i = startIndex; i < metrics.length - 1; i++) {
            const current = metrics[i];
            const next = metrics[i + 1];
            if (!current || !next) continue;
            
            // Skip if we already calculated this pair
            if (current.timestamp <= this.lastCostCalculation!.lastMetricTimestamp) {
                continue;
            }
            
            // Use binary search to find the schedule segment
            const segment = this.findScheduleSegmentByTimestamp(schedule, current.timestamp);
            
            if (!segment) {
                console.warn(`No schedule segment found for metric at ${current.timestamp}`);
                continue;
            }
            
            const timeDiff = next.timestamp - current.timestamp;
            const cost = (timeDiff / (1000 * 60 * 60)) * segment.gridPrice;
            totalCost += cost;
        }
        
        // Update cache
        const lastMetric = metrics[metrics.length - 1];
        if (lastMetric) {
            this.lastCostCalculation = {
                totalCost,
                lastProcessedIndex: metrics.length - 1,
                lastMetricTimestamp: lastMetric.timestamp
            };
        }
        
        return totalCost;
    }
    
    private calculateFullCost(metrics: MetricInstance[], schedule: Schedule): number {
        let totalCost = 0;
        
        for (let i = 0; i < metrics.length - 1; i++) {
            const current = metrics[i];
            const next = metrics[i + 1];
            if (!current || !next) continue;
            
            // Use binary search to find the schedule segment
            const segment = this.findScheduleSegmentByTimestamp(schedule, current.timestamp);
            
            if (!segment) {
                console.warn(`No schedule segment found for metric at ${current.timestamp}`);
                continue;
            }
            
            const timeDiff = next.timestamp - current.timestamp;
            const cost = (timeDiff / (1000 * 60 * 60)) * segment.gridPrice;
            totalCost += cost;
        }
        
        // Cache the result
        const lastMetric = metrics[metrics.length - 1];
        if (lastMetric) {
            this.lastCostCalculation = {
                totalCost,
                lastProcessedIndex: metrics.length - 1,
                lastMetricTimestamp: lastMetric.timestamp
            };
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
    /**
     * Generic binary search helper for finding the first index where condition is true
     */
    private binarySearchFirst<T>(
        array: T[],
        condition: (item: T) => boolean
    ): number {
        if (array.length === 0) return -1;
        
        let left = 0;
        let right = array.length - 1;
        let result = -1;
        
        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            const item = array[mid];
            if (!item) break;
            
            if (condition(item)) {
                result = mid;
                right = mid - 1;
            } else {
                left = mid + 1;
            }
        }
        
        return result;
    }

    /**
     * Generic binary search helper for finding the last index where condition is true
     */
    private binarySearchLast<T>(
        array: T[],
        condition: (item: T) => boolean
    ): number {
        if (array.length === 0) return -1;
        
        let left = 0;
        let right = array.length - 1;
        let result = -1;
        
        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            const item = array[mid];
            if (!item) break;
            
            if (condition(item)) {
                result = mid;
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }
        
        return result;
    }

    /**
     * Find the index of the metric with timestamp closest to the target
     * Assumes metrics array is sorted by timestamp (ascending)
     */
    findMetricIndexByTimestamp(metrics: MetricInstance[], targetTimestamp: number): number {
        if (metrics.length === 0) return -1;
        
        let left = 0;
        let right = metrics.length - 1;
        let closestIndex = 0;
        const firstMetric = metrics[0];
        if (!firstMetric) return -1;
        let minDiff = Math.abs(firstMetric.timestamp - targetTimestamp);
        
        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            const midMetric = metrics[mid];
            if (!midMetric) break;
            
            const currentDiff = Math.abs(midMetric.timestamp - targetTimestamp);
            
            if (currentDiff < minDiff) {
                minDiff = currentDiff;
                closestIndex = mid;
            }
            
            if (midMetric.timestamp === targetTimestamp) {
                return mid;
            } else if (midMetric.timestamp < targetTimestamp) {
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }
        
        return closestIndex;
    }

    /**
     * Find metrics within a time range using binary search
     * Returns start and end indices for the range
     */
    findMetricsInTimeRange(metrics: MetricInstance[], startTime: number, endTime: number): {
        startIndex: number;
        endIndex: number;
        metrics: MetricInstance[];
    } {
        if (metrics.length === 0) {
            return { startIndex: -1, endIndex: -1, metrics: [] };
        }
        
        const startIndex = this.binarySearchFirst(metrics, m => m.timestamp >= startTime);
        const endIndex = this.binarySearchLast(metrics, m => m.timestamp <= endTime);
        
        if (startIndex !== -1 && endIndex !== -1 && startIndex <= endIndex) {
            return {
                startIndex,
                endIndex,
                metrics: metrics.slice(startIndex, endIndex + 1)
            };
        }
        
        return { startIndex: -1, endIndex: -1, metrics: [] };
    }

    /**
     * Find the schedule segment that contains the given timestamp
     * Assumes schedule array is sorted by segment start time
     */
    findScheduleSegmentByTimestamp(schedule: Schedule, targetTimestamp: number): any | null {
        const index = this.findScheduleSegmentIndexByTimestamp(schedule, targetTimestamp);
        return index !== -1 ? schedule[index] : null;
    }

    /**
     * Find the index of the schedule segment that contains the given timestamp
     * Returns -1 if not found
     */
    findScheduleSegmentIndexByTimestamp(schedule: Schedule, targetTimestamp: number): number {
        if (schedule.length === 0) return -1;
        
        let left = 0;
        let right = schedule.length - 1;
        
        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            const segment = schedule[mid];
            if (!segment) break;
            
            const startTime = segment.time.segmentStart.epochMilliseconds;
            const endTime = segment.time.segmentEnd.epochMilliseconds;
            
            if (targetTimestamp >= startTime && targetTimestamp < endTime) {
                return mid;
            } else if (targetTimestamp < startTime) {
                right = mid - 1;
            } else {
                left = mid + 1;
            }
        }
        
        return -1;
    }
}
