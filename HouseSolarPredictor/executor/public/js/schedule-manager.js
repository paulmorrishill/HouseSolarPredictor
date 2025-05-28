// Schedule manager for schedule-specific functionality
class ScheduleManager {
    constructor(logger, dataProcessor, uiManager) {
        this.logger = logger;
        this.dataProcessor = dataProcessor;
        this.uiManager = uiManager;
        this.schedule = null;
        this.scheduleUpdateTimer = null;
    }

    updateScheduleInfo(schedule) {
        // Store schedule for cost calculations
        console.log("Updating schedule info:", schedule);
        this.schedule = schedule;
        if(schedule.length > 0) {
            const firstDate = new Date(schedule[0].time.segmentStart);
            const lastDate = new Date(schedule[schedule.length - 1].time.segmentEnd);
            console.log("⏱️ Schedule First date:", firstDate, "Last date:", lastDate);
        }

        // Update next schedule block info
        this.updateNextScheduleBlock(schedule);
        
        // Start timer to update "Time until" every minute
        this.startScheduleUpdateTimer();
    }

    startScheduleUpdateTimer() {
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

    updateNextScheduleBlock(schedule) {
        console.log("Updating next schedule block with schedule:", schedule);
        if (!Array.isArray(schedule) || schedule.length === 0) {
            this.uiManager.updateElement('next-start-time', '-');
            this.uiManager.updateElement('next-mode', '-');
            this.uiManager.updateElement('next-time-until', '-');
            this.uiManager.updateElement('next-usage', '-');
            return;
        }

        const now = new Date();
        let nextBlock = null;

        // Find next future block
        for (const block of schedule) {
            const startTime = new Date(block.time.segmentStart);
            if (startTime > now) {
                nextBlock = block;
                break;
            }
        }

        if (nextBlock) {
            const startTime = new Date(nextBlock.time.segmentStart);
            const timeUntil = this.calculateTimeUntilDateTime(startTime, now);
            const mode = this.dataProcessor.formatModeName(nextBlock.mode);
            const usage = nextBlock.expectedConsumption
                ? `${nextBlock.expectedConsumption.toFixed(2)} kWh`
                : '-';

            this.uiManager.updateElement('next-start-time', startTime.toLocaleTimeString());
            this.uiManager.updateElement('next-mode', mode);
            this.uiManager.updateElement('next-time-until', timeUntil);
            this.uiManager.updateElement('next-usage', usage);
        } else {
            this.uiManager.updateElement('next-start-time', '-');
            this.uiManager.updateElement('next-mode', '-');
            this.uiManager.updateElement('next-time-until', '-');
            this.uiManager.updateElement('next-usage', '-');
        }
    }

    calculateTimeUntilDateTime(targetDateTime, currentDateTime) {
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

    getSchedule(date) {
        return this.schedule.filter(block => {
            const blockStart = new Date(block.time.segmentStart);
            const blockEnd = new Date(block.time.segmentEnd);
            return blockStart >= date && blockEnd < new Date(date.getTime() + 24 * 60 * 60 * 1000);
        });
    }

    clearScheduleTimer() {
        if (this.scheduleUpdateTimer) {
            clearInterval(this.scheduleUpdateTimer);
            this.scheduleUpdateTimer = null;
        }
    }
}
