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
        if (!Array.isArray(scheduleData)) return [];

        const data = [];
        scheduleData.forEach(segment => {
            const startTime = this.parseDateTime(segment.time.segmentStart);
            const endTime = this.parseDateTime(segment.time.segmentEnd);
            const modeValue = this.convertModeToNumeric(segment.mode);

            data.push({ x: startTime, y: modeValue });
            data.push({ x: endTime, y: modeValue });
        });

        return data.sort((a, b) => a.x - b.x);
    }

    processBatteryScheduleData(scheduleData) {
        if (!Array.isArray(scheduleData)) return [];

        const data = [];
        scheduleData.forEach(segment => {
            const startTime = this.parseDateTime(segment.time.segmentStart);
            const endTime = this.parseDateTime(segment.time.segmentEnd);

            data.push({
                x: startTime,
                y: segment.startBatteryChargeKwh
            });
            data.push({
                x: endTime,
                y: segment.endBatteryChargeKwh
            });
        });

        return data.sort((a, b) => a.x - b.x);
    }

    processGridPricingData(scheduleData) {
        if (!Array.isArray(scheduleData)) return [];

        const data = [];
        scheduleData.forEach(segment => {
            const startTime = this.parseDateTime(segment.time.segmentStart);
            const endTime = this.parseDateTime(segment.time.segmentEnd);
            const priceInPounds = segment.gridPrice;

            data.push({ x: startTime, y: priceInPounds });
            data.push({ x: endTime, y: priceInPounds });
        });

        return data.sort((a, b) => a.x - b.x);
    }

    processPowerFlowData(scheduleData) {
        if (!Array.isArray(scheduleData)) return { load: [], grid: [], solar: [] };

        const loadData = [];
        const gridData = [];
        const solarData = [];

        scheduleData.forEach(segment => {
            const startTime = this.parseDateTime(segment.time.segmentStart);
            
            // Convert kWh to kW (divide by 0.5 for 30-minute segments)
            const loadKw = segment.expectedConsumption / 0.5;
            const gridKw = segment.actualGridUsage / 0.5;
            const solarKw = segment.expectedSolarGeneration / 0.5;

            loadData.push({ x: startTime, y: loadKw });
            gridData.push({ x: startTime, y: gridKw });
            solarData.push({ x: startTime, y: solarKw });
        });

        return {
            load: loadData.sort((a, b) => a.x - b.x),
            grid: gridData.sort((a, b) => a.x - b.x),
            solar: solarData.sort((a, b) => a.x - b.x)
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

    // DateTime parsing - NO time-only support
    parseDateTime(dateTimeString) {
        const date = new Date(dateTimeString);
        if (isNaN(date.getTime())) {
            throw new Error(`Invalid datetime format: ${dateTimeString}`);
        }
        return date;
    }

    getExpectedBatteryLevel(timestamp, schedule) {
        if (!schedule || !Array.isArray(schedule)) return null;

        const targetTime = new Date(timestamp);

        for (const block of schedule) {
            const startTime = this.parseDateTime(block.time.segmentStart);
            const endTime = this.parseDateTime(block.time.segmentEnd);

            if (targetTime >= startTime && targetTime < endTime) {
                // Linear interpolation between start and end battery levels
                const segmentDuration = endTime.getTime() - startTime.getTime();
                const elapsed = targetTime.getTime() - startTime.getTime();
                const progress = segmentDuration > 0 ? elapsed / segmentDuration : 0;

                const interpolatedLevel = block.startBatteryChargeKwh +
                       (block.endBatteryChargeKwh - block.startBatteryChargeKwh) * progress;
                return Math.max(0, Math.min(10, interpolatedLevel));
            }
        }

        return null;
    }

    // DateTime utility methods - system timezone only
    formatDateTime(dateTime) {
        return new Date(dateTime).toLocaleString();
    }

    formatTimeOnly(dateTime) {
        return new Date(dateTime).toLocaleTimeString();
    }

    formatDateOnly(dateTime) {
        return new Date(dateTime).toLocaleDateString();
    }

    isDateTimeInRange(targetDateTime, startDateTime, endDateTime) {
        const target = new Date(targetDateTime);
        const start = new Date(startDateTime);
        const end = new Date(endDateTime);
        
        return target >= start && target < end;
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
