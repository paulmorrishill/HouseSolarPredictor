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
        const currentTime = now.toTimeString().slice(0, 8); // HH:MM:SS format
        
        // Find the next schedule block
        let nextBlock = null;
        let isNextDay = false;
        
        for (const block of schedule) {
            if (block.time && block.time.hourStart > currentTime) {
                nextBlock = block;
                break;
            }
        }
        
        // If no block found for today, use the first block (next day)
        if (!nextBlock && schedule.length > 0) {
            nextBlock = schedule[0];
            isNextDay = true;
        }
        
        if (nextBlock) {
            // Format start time
            const startTime = nextBlock.time.hourStart;
            
            // Calculate time until next block starts
            const timeUntil = this.calculateTimeUntil(startTime, currentTime, isNextDay);
            
            // Format mode name
            const mode = this.dataProcessor.formatModeName(nextBlock.mode);
            
            // Format expected usage
            const usage = nextBlock.expectedConsumption
                ? `${nextBlock.expectedConsumption.toFixed(2)} kWh`
                : '-';
            
            this.uiManager.updateElement('next-start-time', startTime);
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

    calculateTimeUntil(startTime, currentTime, isNextDay) {
        const startParts = startTime.split(':').map(Number);
        const currentParts = currentTime.split(':').map(Number);
        
        const startMinutes = startParts[0] * 60 + startParts[1];
        const currentMinutes = currentParts[0] * 60 + currentParts[1];
        
        let minutesUntil;
        if (isNextDay) {
            // Next day calculation: minutes until midnight + minutes from midnight to start
            minutesUntil = (24 * 60 - currentMinutes) + startMinutes;
        } else {
            minutesUntil = startMinutes - currentMinutes;
        }
        
        const hoursUntil = Math.floor(minutesUntil / 60);
        const remainingMinutes = minutesUntil % 60;
        
        if (hoursUntil > 0) {
            return `${hoursUntil}h ${remainingMinutes}m`;
        } else {
            return `${remainingMinutes}m`;
        }
    }

    getCurrentScheduleBlock() {
        if (!this.schedule || !Array.isArray(this.schedule)) {
            return null;
        }

        const now = new Date();
        const currentTime = now.toTimeString().slice(0, 8); // HH:MM:SS format
        
        // Find the current schedule block
        for (const block of this.schedule) {
            if (block.time && 
                currentTime >= block.time.hourStart && 
                currentTime < block.time.hourEnd) {
                return block;
            }
        }
        
        return null;
    }

    getScheduleBlockAtTime(timeString) {
        if (!this.schedule || !Array.isArray(this.schedule)) {
            return null;
        }
        
        // Find the schedule block that contains this time
        for (const block of this.schedule) {
            if (block.time && 
                timeString >= block.time.hourStart && 
                timeString < block.time.hourEnd) {
                return block;
            }
        }
        
        return null;
    }

    getExpectedModeAtTime(timeString) {
        const block = this.getScheduleBlockAtTime(timeString);
        return block ? block.mode : null;
    }

    getExpectedChargeRateAtTime(timeString) {
        const block = this.getScheduleBlockAtTime(timeString);
        if (!block) return null;
        
        // Determine charge rate based on mode
        switch (block.mode) {
            case 'ChargeFromGridAndSolar':
                return 100; // Full charge rate
            case 'ChargeSolarOnly':
            case 'Discharge':
                return 0; // No grid charging
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
                if (!block.time.hourStart) {
                    errors.push(`Block ${index}: missing hourStart`);
                }
                if (!block.time.hourEnd) {
                    errors.push(`Block ${index}: missing hourEnd`);
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