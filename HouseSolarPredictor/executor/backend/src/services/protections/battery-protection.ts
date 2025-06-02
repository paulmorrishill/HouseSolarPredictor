import {InverterMode, MetricInstance} from "@shared";
import {ProtectionOverride} from "./protection-interface.ts";

const DISCHARGE_THRESHOLD = 4;
const CRITICAL_THRESHOLD = 2;
const RECOVERY_THRESHOLD = 4;
const MIN_CHARGE_RATE = 1;

export class BatteryProtection implements ProtectionOverride {
  private isProtectionActive = false;
  private readonly activationThreshold = CRITICAL_THRESHOLD;
  private readonly deactivationThreshold = CRITICAL_THRESHOLD + 1;

  checkOverride(
    plannedMode: InverterMode,
    plannedChargeRate: number,
    currentMetrics: MetricInstance
  ): { workMode: InverterMode; chargeRate: number } | null {
    const batteryCharge = currentMetrics.batteryChargePercent;

    // Check if we should activate protection (battery drops to or below activation threshold)
    if (!this.isProtectionActive && batteryCharge <= this.activationThreshold) {
      this.isProtectionActive = true;
    }

    // Check if we should deactivate protection (battery rises above deactivation threshold)
    if (this.isProtectionActive && batteryCharge > this.deactivationThreshold) {
      this.isProtectionActive = false;
    }

    // If protection is not active, no override needed
    if (!this.isProtectionActive) {
      return null;
    }

    // If we are already in Battery first mode and charge rate is above minimum, no override needed
    if (plannedMode === "Battery first" && plannedChargeRate > MIN_CHARGE_RATE) {
      return null;
    }

    // Force charge mode and ensure minimum charge rate
    return {
      workMode: "Battery first",
      chargeRate: MIN_CHARGE_RATE
    };
  }

  getName(): string {
    return "Battery Protection";
  }
}
