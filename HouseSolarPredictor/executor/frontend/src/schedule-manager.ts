import { Temporal } from '@js-temporal/polyfill';
import { Logger } from './logger';
import { DataProcessor } from './data-processor';
import {FrontEndTimeSegment, Schedule} from "./types/front-end-time-segment";

export class ScheduleManager {
    private readonly logger: Logger;
    private readonly dataProcessor: DataProcessor;
    private schedule: Schedule = [];
    private scheduleUpdateTimer: number | null = null;

    constructor(logger: Logger, dataProcessor: DataProcessor) {
        this.logger = logger;
        this.dataProcessor = dataProcessor;
    }

    private parseSegmentStart(timeSegment: any): Temporal.ZonedDateTime | null {
        if (!timeSegment?.time?.segmentStart) return null;
        
        const instant = Temporal.Instant.from(timeSegment.time.segmentStart);
        return instant.toZonedDateTimeISO('Europe/London');
    }

    private parseSegmentEnd(timeSegment: any): Temporal.ZonedDateTime | null {
        if (!timeSegment?.time?.segmentEnd) return null;
        
        const instant = Temporal.Instant.from(timeSegment.time.segmentEnd);
        return instant.toZonedDateTimeISO('Europe/London');
    }

    setSchedule(rawSchedule: FrontEndTimeSegment[]): void {
        // Store schedule for cost calculations

        const schedule = rawSchedule.reduce((acc, segment) => {
            const existing = acc.find(s => {
                let startIsSame = s.time.segmentStart.epochMilliseconds === segment.time.segmentStart.epochMilliseconds;
                let endIsSame = s.time.segmentEnd.epochMilliseconds === segment.time.segmentEnd.epochMilliseconds;
                return startIsSame && endIsSame;
            });
            if (!existing) {
                acc.push(segment);
            }
            return acc;
        }, [] as FrontEndTimeSegment[]);

        this.logger.addLogEntry("Updating schedule info segments: " + schedule.length, 'info');
        this.schedule = schedule;
        if (schedule.length > 0) {
            const firstBlock = schedule[0] as any;
            const lastBlock = schedule[schedule.length - 1] as any;
            const firstDate = this.parseSegmentStart(firstBlock);
            const lastDate = this.parseSegmentEnd(lastBlock);
            
            if (firstDate && lastDate) {
                console.log("⏱️ Schedule First date:", firstDate.toString(), "Last date:", lastDate.toString());
            }
        }

        // Update next schedule block info
        this.updateNextScheduleBlock(schedule);
        
        // Start timer to update "Time until" every minute
        this.startScheduleUpdateTimer();
    }

    private startScheduleUpdateTimer(): void {
        // Clear existing timer
        if (this.scheduleUpdateTimer) {
            clearInterval(this.scheduleUpdateTimer);
        }
        
        // Update every minute
        this.scheduleUpdateTimer = setInterval(() => {
            if (this.schedule) {
                this.updateNextScheduleBlock(this.schedule);
            }
        }, 60000); // 60 seconds
    }

    private updateNextScheduleBlock(schedule: Schedule): void {
        console.log("Updating next schedule block with schedule:", schedule);
        if (!Array.isArray(schedule) || schedule.length === 0) {
            this.updateScheduleElements('-', '-', '-', '-');
            return;
        }

        const now = Temporal.Now.zonedDateTimeISO('Europe/London');
        let nextBlock: any = null;

        // Find next future block
        for (const block of schedule) {
            const startTime = this.parseSegmentStart(block);
            if (startTime && Temporal.ZonedDateTime.compare(startTime, now) > 0) {
                nextBlock = block;
                break;
            }
        }

        const startTime = this.parseSegmentStart(nextBlock);
        if (startTime) {
            const timeUntil = this.calculateTimeUntilDateTime(startTime, now);
            const mode = this.dataProcessor.formatModeName(nextBlock.mode);
            const usage = nextBlock.expectedConsumption
                ? `${nextBlock.expectedConsumption.toFixed(2)} kWh`
                : '-';

            this.updateScheduleElements(
                startTime.toPlainTime().toLocaleString(),
                mode,
                timeUntil,
                usage
            );
        } else {
            this.updateScheduleElements('-', '-', '-', '-');
        }
    }

    private updateScheduleElements(startTime: string, mode: string, timeUntil: string, usage: string): void {
        const startTimeElement = document.getElementById('next-start-time');
        const modeElement = document.getElementById('next-mode');
        const timeUntilElement = document.getElementById('next-time-until');
        const usageElement = document.getElementById('next-usage');

        if (startTimeElement) startTimeElement.textContent = startTime;
        if (modeElement) modeElement.textContent = mode;
        if (timeUntilElement) timeUntilElement.textContent = timeUntil;
        if (usageElement) usageElement.textContent = usage;
    }

    private calculateTimeUntilDateTime(targetDateTime: Temporal.ZonedDateTime, currentDateTime: Temporal.ZonedDateTime): string {
        const timeDiff = targetDateTime.epochMilliseconds - currentDateTime.epochMilliseconds;
        
        if (timeDiff <= 0) return "Now";

        const hoursUntil = Math.floor(timeDiff / (1000 * 60 * 60));
        const minutesUntil = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));

        if (hoursUntil > 0) {
            return `${hoursUntil}h ${minutesUntil}m`;
        } else {
            return `${minutesUntil}m`;
        }
    }

    getSchedule(date: Temporal.PlainDate): Schedule {
        if (!this.schedule) return [];
        
        const targetDate = date.toZonedDateTime({
            timeZone: 'Europe/London',
            plainTime: Temporal.PlainTime.from('00:00:00')
        }).toInstant();
        const nextDay = date.add({ days: 1 }).toZonedDateTime({
            timeZone: 'Europe/London',
            plainTime: Temporal.PlainTime.from('00:00:00')
        }).toInstant();
        
        return this.schedule.filter(block => {
            return Temporal.Instant.compare(
                Temporal.Instant.from(block.time.segmentStart),
                targetDate
            ) >= 0 && Temporal.Instant.compare(
                Temporal.Instant.from(block.time.segmentEnd),
                nextDay
            ) < 0;
        });
    }

    clearScheduleTimer(): void {
        if (this.scheduleUpdateTimer) {
            clearInterval(this.scheduleUpdateTimer);
            this.scheduleUpdateTimer = null;
        }
    }
}
