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
        this.schedule = schedule;
        
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

    getCurrentScheduleBlock() {
        if (!this.schedule || !Array.isArray(this.schedule)) {
            return null;
        }

        const now = new Date();
        
        for (const block of this.schedule) {
            const startTime = new Date(block.time.segmentStart);
            const endTime = new Date(block.time.segmentEnd);
            
            if (now >= startTime && now < endTime) {
                return block;
            }
        }
        
        return null;
    }

    getScheduleBlockAtDateTime(targetDateTime) {
        if (!this.schedule || !Array.isArray(this.schedule)) {
            return null;
        }

        const target = new Date(targetDateTime);

        for (const block of this.schedule) {
            const startTime = new Date(block.time.segmentStart);
            const endTime = new Date(block.time.segmentEnd);
            
            if (target >= startTime && target < endTime) {
                return block;
            }
        }

        return null;
    }

    getExpectedModeAtDateTime(targetDateTime) {
        const block = this.getScheduleBlockAtDateTime(targetDateTime);
        return block ? block.mode : null;
    }

    getExpectedChargeRateAtDateTime(targetDateTime) {
        const block = this.getScheduleBlockAtDateTime(targetDateTime);
        if (!block) return null;

        switch (block.mode) {
            case 'ChargeFromGridAndSolar':
                return 100;
            case 'ChargeSolarOnly':
            case 'Discharge':
                return 0;
            default:
                return null;
        }
    }

    getScheduleStatistics() {
        if (!this.schedule || !Array.isArray(this.schedule)) {
            return null;
        }

        const stats = {
            totalBlocks: this.schedule.length,
            chargeBlocks: 0,
            dischargeBlocks: 0,
            solarOnlyBlocks: 0,
            totalExpectedConsumption: 0,
            totalExpectedGeneration: 0,
            totalExpectedGridUsage: 0,
            totalExpectedCost: 0
        };

        this.schedule.forEach(block => {
            switch (block.mode) {
                case 'ChargeFromGridAndSolar':
                    stats.chargeBlocks++;
                    break;
                case 'ChargeSolarOnly':
                    stats.solarOnlyBlocks++;
                    break;
                case 'Discharge':
                    stats.dischargeBlocks++;
                    break;
            }

            stats.totalExpectedConsumption += block.expectedConsumption || 0;
            stats.totalExpectedGeneration += block.expectedSolarGeneration || 0;
            stats.totalExpectedGridUsage += block.actualGridUsage || 0;
            
            if (block.cost && block.cost.poundsAmount) {
                stats.totalExpectedCost += block.cost.poundsAmount;
            }
        });

        return stats;
    }

    validateSchedule(schedule) {
        if (!Array.isArray(schedule)) {
            this.logger.addLogEntry('❌ Schedule validation failed: not an array', 'error');
            return false;
        }

        if (schedule.length === 0) {
            this.logger.addLogEntry('❌ Schedule validation failed: empty schedule', 'error');
            return false;
        }

        const errors = [];
        
        schedule.forEach((block, index) => {
            // Check required fields
            if (!block.time) {
                errors.push(`Block ${index}: missing time field`);
            } else {
                if (!block.time.segmentStart) {
                    errors.push(`Block ${index}: missing segmentStart`);
                } else {
                    const startDate = new Date(block.time.segmentStart);
                    if (isNaN(startDate.getTime())) {
                        errors.push(`Block ${index}: invalid segmentStart datetime format`);
                    }
                }
                
                if (!block.time.segmentEnd) {
                    errors.push(`Block ${index}: missing segmentEnd`);
                } else {
                    const endDate = new Date(block.time.segmentEnd);
                    if (isNaN(endDate.getTime())) {
                        errors.push(`Block ${index}: invalid segmentEnd datetime format`);
                    }
                }
            }

            if (!block.mode) {
                errors.push(`Block ${index}: missing mode field`);
            } else {
                const validModes = ['ChargeFromGridAndSolar', 'ChargeSolarOnly', 'Discharge'];
                if (!validModes.includes(block.mode)) {
                    errors.push(`Block ${index}: invalid mode '${block.mode}'`);
                }
            }

            // Check numeric fields
            const numericFields = [
                'expectedSolarGeneration',
                'expectedConsumption',
                'actualGridUsage',
                'gridPrice',
                'startBatteryChargeKwh',
                'endBatteryChargeKwh'
            ];

            numericFields.forEach(field => {
                if (block[field] !== undefined && typeof block[field] !== 'number') {
                    errors.push(`Block ${index}: ${field} must be a number`);
                }
            });
        });

        if (errors.length > 0) {
            this.logger.addLogEntry(`❌ Schedule validation failed: ${errors.join(', ')}`, 'error');
            return false;
        }

        this.logger.addLogEntry('✅ Schedule validation passed', 'info');
        return true;
    }

    getSchedule() {
        return this.schedule;
    }

    clearScheduleTimer() {
        if (this.scheduleUpdateTimer) {
            clearInterval(this.scheduleUpdateTimer);
            this.scheduleUpdateTimer = null;
        }
    }
}