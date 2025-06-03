import {InverterMode, MetricInstance} from "@shared";
import {ProtectionOverride} from "./protection-interface.ts";
import {ScheduleService} from "../schedule.ts";

export class BatteryOverchargeProtection implements ProtectionOverride {
  private readonly activationThresholdPercent = 10; // 10% over expected level to activate
  private readonly deactivationThresholdPercent = 5; // 5% over expected level to deactivate
  private scheduleService: ScheduleService;
  private isActive = false; // Track whether protection is currently active

  constructor(scheduleService: ScheduleService) {
    this.scheduleService = scheduleService;
  }

  checkOverride(
    plannedMode: InverterMode, 
    plannedChargeRate: number, 
    currentMetrics: MetricInstance
  ): { workMode: InverterMode; chargeRate: number } | null {
    
    // Don't intervene if already planning to discharge (Load first with negative charge rate)
    if (plannedMode === "Load first") {
      return null;
    }

    // Only intervene if the planned mode is "Battery first" with positive charge rate
    if (plannedMode !== "Battery first" || plannedChargeRate <= 0) {
      return null;
    }

    // Get current schedule segment to find expected battery level
    const currentSegment = this.scheduleService.getCurrentTimeSegment();
    if (!currentSegment) {
      return null; // No schedule data available
    }

    // Check if grid price is negative (allow charging even if overcharged)
    if (currentSegment.gridPrice < 0) {
      return null; // Allow charging when grid price is negative
    }

    // Calculate expected battery percentage from schedule
    // The schedule contains battery charge in kWh, we need to convert to percentage
    const batteryCapacityKwh = currentMetrics.batteryCapacity;
    if (batteryCapacityKwh <= 0) {
      return null; // Can't calculate without battery capacity
    }

    // Calculate expected battery percentage based on current time within the segment
    const now = Temporal.Now.instant();
    const segmentStart = currentSegment.time.segmentStart;
    const segmentEnd = currentSegment.time.segmentEnd;
    
    // Calculate how far through the segment we are (0 to 1)
    const segmentDurationMs = segmentEnd.epochMilliseconds - segmentStart.epochMilliseconds;
    const elapsedMs = now.epochMilliseconds - segmentStart.epochMilliseconds;
    const segmentProgress = Math.max(0, Math.min(1, elapsedMs / segmentDurationMs));
    
    // Interpolate expected battery charge based on progress through segment
    const expectedBatteryKwh = currentSegment.startBatteryChargeKwh + 
      (currentSegment.endBatteryChargeKwh - currentSegment.startBatteryChargeKwh) * segmentProgress;
    
    const expectedBatteryPercent = (expectedBatteryKwh / batteryCapacityKwh) * 100;
    const currentBatteryPercent = currentMetrics.batteryChargePercent;
    
    // Check if current battery level is above expected level
    const overchargeAmount = currentBatteryPercent - expectedBatteryPercent;
    
    // Implement hysteresis: activate at 10% over, deactivate at 5% over
    if (!this.isActive && overchargeAmount > this.activationThresholdPercent) {
      this.isActive = true;
    } else if (this.isActive && overchargeAmount <= this.deactivationThresholdPercent) {
      this.isActive = false;
    }

    // Only return override if protection is active
    if (this.isActive) {
      // Battery is overcharged, switch to Battery first with 0% charge rate (solar only)
      return {
        workMode: "Battery first",
        chargeRate: 0
      };
    }

    return null; // No override needed
  }

  getName(): string {
    return "Battery Unnecessary Charge Prevention";
  }
}