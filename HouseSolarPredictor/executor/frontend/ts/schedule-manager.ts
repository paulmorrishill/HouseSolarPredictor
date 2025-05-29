import { Logger } from './logger';
import { DataProcessor } from './data-processor';
import {Schedule} from "@shared/definitions/schedule";
import {TimeSegment} from "@shared";

export class ScheduleManager {
    private readonly logger: Logger;
    private readonly dataProcessor: DataProcessor;
    private schedule: Schedule | null = null;
    private scheduleUpdateTimer: number | null = null;

    constructor(logger: Logger, dataProcessor: DataProcessor) {
        this.logger = logger;
        this.dataProcessor = dataProcessor;
    }

    updateScheduleInfo(schedule: TimeSegment[]): void {
        // Store schedule for cost calculations
        this.logger.addLogEntry("Updating schedule info segments: " + schedule.length, 'info');
        this.schedule = schedule;
        if (schedule.length > 0) {
            const firstBlock = schedule[0] as any;
            const lastBlock = schedule[schedule.length - 1] as any;
            if (firstBlock.time && lastBlock.time) {
                const firstDate = new Date(firstBlock.time.segmentStart);
                const lastDate = new Date(lastBlock.time.segmentEnd);
                console.log("⏱️ Schedule First date:", firstDate, "Last date:", lastDate);
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

        const now = new Date();
        let nextBlock: any = null;

        // Find next future block
        for (const block of schedule) {
            if (block.time && block.time.segmentStart) {
                const startTime = new Date(block.time.segmentStart);
                if (startTime > now) {
                    nextBlock = block;
                    break;
                }
            }
        }

        if (nextBlock && nextBlock.time) {
            const startTime = new Date(nextBlock.time.segmentStart);
            const timeUntil = this.calculateTimeUntilDateTime(startTime, now);
            const mode = this.dataProcessor.formatModeName(nextBlock.mode);
            const usage = nextBlock.expectedConsumption
                ? `${nextBlock.expectedConsumption.toFixed(2)} kWh`
                : '-';

            this.updateScheduleElements(
                startTime.toLocaleTimeString(),
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

    private calculateTimeUntilDateTime(targetDateTime: Date, currentDateTime: Date): string {
        const timeDiff = targetDateTime.getTime() - currentDateTime.getTime();
        
        if (timeDiff <= 0) return "Now";

        const hoursUntil = Math.floor(timeDiff / (1000 * 60 * 60));
        const minutesUntil = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));

        if (hoursUntil > 0) {
            return `${hoursUntil}h ${minutesUntil}m`;
        } else {
            return `${minutesUntil}m`;
        }
    }

    getSchedule(date: string): Schedule {
        if (!this.schedule) return [];
        
        const targetDate = new Date(date);
        const nextDay = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000);
        
        return this.schedule.filter(block => {
            if (!block.time || !block.time.segmentStart || !block.time.segmentEnd) {
                return false;
            }
            const blockStart = new Date(block.time.segmentStart);
            const blockEnd = new Date(block.time.segmentEnd);
            return blockStart >= targetDate && blockEnd < nextDay;
        });
    }

    clearScheduleTimer(): void {
        if (this.scheduleUpdateTimer) {
            clearInterval(this.scheduleUpdateTimer);
            this.scheduleUpdateTimer = null;
        }
    }
}
