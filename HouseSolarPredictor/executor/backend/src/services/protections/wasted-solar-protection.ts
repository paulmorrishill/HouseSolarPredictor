import {InverterMode, MetricInstance} from "@shared";
import {ProtectionOverride} from "./protection-interface.ts";

export class WastedSolarProtection implements ProtectionOverride {
  private readonly batteryActivationThreshold = 97; // Battery charge percentage to turn on protection
  private readonly batteryDeactivationThreshold = 95; // Battery charge percentage to turn off protection
  private readonly startHour = 8; // Start of solar generation window
  private readonly endHour = 18; // End of solar generation window
  private isActive = false; // Track whether protection is currently active

  checkOverride(
    plannedMode: InverterMode, 
    plannedChargeRate: number, 
    currentMetrics: MetricInstance
  ): { workMode: InverterMode; chargeRate: number } | null {
    const batteryCharge = currentMetrics.batteryChargePercent;

    // Check time is within solar generation window first
    const now = Temporal.Now.instant().toZonedDateTimeISO('Europe/London');
    if (now.hour < this.startHour || now.hour > this.endHour) {
      this.isActive = false; // Deactivate outside solar hours
      return null;
    }

    // Implement hysteresis: turn on at 97%, turn off at 95%
    if (!this.isActive && batteryCharge >= this.batteryActivationThreshold) {
      this.isActive = true;
    } else if (this.isActive && batteryCharge < this.batteryDeactivationThreshold) {
      this.isActive = false;
    }

    // Only return override if protection is active
    if (!this.isActive) {
      return null;
    }

    // Switch to Load first mode to prevent wasting solar energy
    return {
      workMode: 'Load first',
      chargeRate: 0
    };
  }

  getName(): string {
    return "Wasted Solar Protection";
  }
}
