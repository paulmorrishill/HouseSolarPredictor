// Data processing utilities for metrics and schedule data
class DataProcessor {
    constructor(logger) {
        this.logger = logger;
    }

    filterMetricsByTimeRange(metrics, hours) {
        if (!Array.isArray(metrics) || metrics.length === 0) {
            return [];
        }

        const now = Date.now();
        const cutoffTime = now - (hours * 60 * 60 * 1000); // Convert hours to milliseconds
        
        return metrics.filter(metric => metric.timestamp >= cutoffTime);
    }

    limitDataPoints(metrics, maxPoints) {
        if (!Array.isArray(metrics) || metrics.length <= maxPoints) {
            return metrics;
        }

        // Calculate step size to evenly distribute data points
        const step = Math.ceil(metrics.length / maxPoints);
        const limitedMetrics = [];
        
        for (let i = 0; i < metrics.length; i += step) {
            limitedMetrics.push(metrics[i]);
        }
        
        // Always include the last data point
        if (limitedMetrics[limitedMetrics.length - 1] !== metrics[metrics.length - 1]) {
            limitedMetrics.push(metrics[metrics.length - 1]);
        }
        
        return limitedMetrics;
    }

    processModeTimelineData(scheduleData) {
        const data = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        scheduleData.forEach(segment => {
            const startTime = this.parseTimeToDate(segment.time.hourStart, today);
            const endTime = this.parseTimeToDate(segment.time.hourEnd, today);
            
            const modeValue = this.convertModeToNumeric(segment.mode);
            
            // Add start point
            data.push({
                x: startTime,
                y: modeValue
            });
            
            // Add end point for step effect
            data.push({
                x: endTime,
                y: modeValue
            });
        });

        return data;
    }

    processBatteryScheduleData(scheduleData) {
        const data = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        scheduleData.forEach(segment => {
            const startTime = this.parseTimeToDate(segment.time.hourStart, today);
            const endTime = this.parseTimeToDate(segment.time.hourEnd, today);
            
            // Add start point
            data.push({
                x: startTime,
                y: segment.startBatteryChargeKwh
            });
            
            // Add end point for interpolation
            data.push({
                x: endTime,
                y: segment.endBatteryChargeKwh
            });
        });

        return data;
    }

    processGridPricingData(scheduleData) {
        const data = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        scheduleData.forEach(segment => {
            const startTime = this.parseTimeToDate(segment.time.hourStart, today);
            const endTime = this.parseTimeToDate(segment.time.hourEnd, today);
            
            // Convert pence to pounds
            const priceInPounds = segment.gridPrice / 100;
            
            // Add start point
            data.push({
                x: startTime,
                y: priceInPounds
            });
            
            // Add end point for step effect
            data.push({
                x: endTime,
                y: priceInPounds
            });
        });

        return data;
    }

    processPowerFlowData(scheduleData) {
        const loadData = [];
        const gridData = [];
        const solarData = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        scheduleData.forEach(segment => {
            const startTime = this.parseTimeToDate(segment.time.hourStart, today);
            
            // Convert kWh to kW (divide by 0.5 for 30-minute segments)
            const loadKw = segment.expectedConsumption / 0.5;
            const gridKw = segment.actualGridUsage / 0.5;
            const solarKw = segment.expectedSolarGeneration / 0.5;
            
            loadData.push({
                x: startTime,
                y: loadKw
            });
            
            gridData.push({
                x: startTime,
                y: gridKw
            });
            
            solarData.push({
                x: startTime,
                y: solarKw
            });
        });

        return {
            load: loadData,
            grid: gridData,
            solar: solarData
        };
    }

    convertModeToNumeric(mode) {
        const modeMap = {
            'ChargeFromGridAndSolar': 1,
            'ChargeSolarOnly': 2,
            'Discharge': 3
        };
        return modeMap[mode] || 0;
    }

    parseTimeToDate(timeString, baseDate) {
        const [hours, minutes, seconds] = timeString.split(':').map(Number);
        const date = new Date(baseDate);
        date.setHours(hours, minutes, seconds || 0, 0);
        return date;
    }

    parseTimeString(timeStr) {
        // Convert HH:MM:SS to minutes since midnight
        const parts = timeStr.split(':').map(Number);
        return parts[0] * 60 + parts[1] + parts[2] / 60;
    }

    getExpectedBatteryLevel(timestamp, schedule) {
        if (!schedule || !Array.isArray(schedule)) {
            return null;
        }

        const time = new Date(timestamp);
        const timeString = time.toTimeString().slice(0, 8); // HH:MM:SS format
        
        // Find the schedule block that contains this time
        for (const block of schedule) {
            if (timeString >= block.time.hourStart && timeString < block.time.hourEnd) {
                // Interpolate between start and end battery levels
                const startLevel = block.startBatteryChargeKwh || 0;
                const endLevel = block.endBatteryChargeKwh || 0;

                // Calculate progress through the time segment
                const segmentStart = this.parseTimeString(block.time.hourStart);
                const segmentEnd = this.parseTimeString(block.time.hourEnd);
                const currentTime = this.parseTimeString(timeString);

                const segmentDuration = segmentEnd - segmentStart;
                const elapsed = currentTime - segmentStart;
                const progress = segmentDuration > 0 ? elapsed / segmentDuration : 0;

                // Linear interpolation between start and end levels
                const interpolatedLevel = startLevel + (endLevel - startLevel) * progress;
                return Math.max(0, Math.min(10, interpolatedLevel));
            }
        }

        console.warn('Unable to find expected battery level for time:', timestamp);
        return null;
    }

    calculateCost(metrics) {
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

    formatModeName(mode) {
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

    formatMode(mode) {
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