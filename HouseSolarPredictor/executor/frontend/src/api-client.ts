import { Temporal } from '@js-temporal/polyfill';
import {MetricInstance, RawTimeSegment} from "@shared";
import {FrontEndTimeSegment} from "./types/front-end-time-segment";

export class ApiClient {
    constructor() {
    }

    async retryOperations(): Promise<any> {
        console.log('🔄 Initiating retry operations...', 'info');
        try {
            const response = await fetch('/api/retry', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const result = await response.json();
                console.log('✅ Retry operation initiated successfully', 'info');
                return result;
            } else {
                console.log(`❌ Retry failed - HTTP ${response.status}`, 'error');
                throw new Error('Failed to retry operations');
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('Error retrying operations:', error);
            console.log(`❌ Retry operation failed: ${errorMessage}`, 'error');
            throw error;
        }
    }

    async loadScheduleData(selectedDate: Temporal.PlainDate): Promise<FrontEndTimeSegment[]> {
        if (!selectedDate) {
            console.log('❌ No date selected for schedule data', 'error');
            throw new Error('No date selected for schedule data');
        }
        
        const dateStr = selectedDate.toString();
        const url = `/api/schedule?date=${dateStr}`;
        console.log(`🔄 Loading schedule data from ${url}...`, 'info');
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to load schedule data: ${response.statusText} (${response.status})`);
        }

        const scheduleData = await response.json() as RawTimeSegment[];
        console.log(`📊 Schedule data loaded successfully for ${dateStr}`, 'info');
        return scheduleData.map(ts => {
            return {
                ...ts,
                time: {
                    segmentStart: Temporal.Instant.from(ts.time.segmentStart),
                    segmentEnd: Temporal.Instant.from(ts.time.segmentEnd)
                }
            }
        });
    }

    async loadMetricsData(selectedDate: Temporal.PlainDate, hours: number = 24): Promise<MetricInstance[]> {
        let url = `/api/metrics?hours=${hours}`;
        const dateStr = selectedDate.toString();
        url += `&date=${dateStr}`;
        console.log(`🔄 Loading metrics data from ${url}...`, 'info');
        const response = await fetch(url);
        if (response.ok) {
            const MetricInstance = await response.json() as MetricInstance[];
            console.log(`📊 Metrics data loaded successfully for ${dateStr}`, 'info');
            return MetricInstance;
        } else {
            console.log('❌ Failed to load metrics data', 'error');
            throw new Error(`Failed to load metrics data: ${response.statusText} (${response.status})`);
        }
    }
}
