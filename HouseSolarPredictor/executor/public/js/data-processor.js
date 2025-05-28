// Data processing utilities for metrics and schedule data
const MODE_CHARGE_FROM_GRID_AND_SOLAR = 3;
const MODE_CHARGE_SOLAR_ONLY = 2;
const MODE_DISCHARGE = 1;
class DataProcessor {
    constructor(logger) {
        this.logger = logger;
    }

    filterMetricsByTimeRange(metrics, hours, selectedDate = null) {
        if (!Array.isArray(metrics) || metrics.length === 0) {
            return [];
        }

        let endTime, cutoffTime;
        
        if (selectedDate) {
            // For historical dates, filter based on the selected date
            const selectedDateObj = new Date(selectedDate + 'T23:59:59.999Z');
            endTime = selectedDateObj.getTime();
            cutoffTime = endTime - (hours * 60 * 60 * 1000);
        } else {
            // For today, use current time
            endTime = Date.now();
            cutoffTime = endTime - (hours * 60 * 60 * 1000);
        }
        
        return metrics.filter(metric => {
            const timestamp = metric.timestamp;
            return timestamp >= cutoffTime && timestamp <= endTime;
        });
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

    processModeTimelineData(scheduleData, historicData) {
        if (!Array.isArray(scheduleData)) return {
            planned: [],
            actual: []
        };

        const plannedMode = [];

        scheduleData.forEach((segment, i) => {
            const startTime = this.parseDateTime(segment.time.segmentStart);
            const endTime = this.parseDateTime(segment.time.segmentEnd);
            const modeValue = this.convertPlannedModeToNumeric(segment.mode);

            plannedMode.push({ x: startTime, y: modeValue });
            if (i === scheduleData.length - 1) {
                plannedMode.push({ x: endTime, y: modeValue });
            }
        });

        const actualModes = historicData.filter(m => m.workModePriority).map(metric => {
            const startTime = metric.timestamp;
            const modeValue = this.convertActualModeToNumeric(metric);

            return { x: startTime, y: modeValue };
        });

        // Add the last point of now with the same mode
        if (actualModes.length > 0) {
            const lastMode = actualModes[actualModes.length - 1].y;
            actualModes.push({ x: Date.now(), y: lastMode });
        }

        const dedupedModes = [actualModes[0]];
        for (let i = 1; i < actualModes.length; i++) {
            let mostRecentMode = dedupedModes[dedupedModes.length-1].y;
            let currentDataPointMode = actualModes[i].y;
            let modeHasChanged = mostRecentMode !== currentDataPointMode;
            if (modeHasChanged) {
                dedupedModes.push(actualModes[i-1]);
                dedupedModes.push(actualModes[i]);
            }
        }

        return {
            planned: plannedMode.sort((a, b) => a.x - b.x),
            actual: dedupedModes.sort((a, b) => a.x - b.x)
        };
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
        scheduleData.forEach((segment, i) => {
            const startTime = this.parseDateTime(segment.time.segmentStart);
            const endTime = this.parseDateTime(segment.time.segmentEnd);
            const priceInPounds = segment.gridPrice;

            data.push({ x: startTime, y: priceInPounds });
            if (i < scheduleData.length - 1) {
                // Add a point at the end of the segment to maintain the price until the next segment
                data.push({ x: endTime, y: priceInPounds });
            }
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

    convertPlannedModeToNumeric(mode) {
        const modeMap = {
            'ChargeFromGridAndSolar': MODE_CHARGE_FROM_GRID_AND_SOLAR,
            'ChargeSolarOnly': MODE_CHARGE_SOLAR_ONLY,
            'Discharge': MODE_DISCHARGE
        };
        return modeMap[mode] || 0;
    }

    convertActualModeToNumeric(metric) {
        if(metric.workModePriority === 'Battery first') {
            if(metric.batteryChargeRate > 50){
                return MODE_CHARGE_FROM_GRID_AND_SOLAR; // Battery first with high charge rate
            } else {
                return MODE_CHARGE_SOLAR_ONLY; // Battery first with low charge rate
            }
        }
        if (metric.workModePriority === 'Load first') {
            return MODE_DISCHARGE;
        }

        throw new Error('Unknown work mode priority: ' + metric.workModePriority);
    }

    parseDateTime(dateTimeString) {
        const date = new Date(dateTimeString);
        if (isNaN(date.getTime())) {
            throw new Error(`Invalid datetime format: ${dateTimeString}`);
        }
        return date;
    }

    getExpectedBatteryLevel(timestamp, schedule) {
        if (!Array.isArray(schedule)) return null;

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
