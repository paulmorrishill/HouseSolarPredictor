import {InverterMode, MetricInstance} from "@shared";

export interface ProtectionOverride {
  /**
   * Checks if this protection should override the planned inverter settings
   * @param plannedMode The planned inverter mode
   * @param plannedChargeRate The planned charge rate
   * @param currentMetrics Current system metrics
   * @returns Override settings if protection should activate, null otherwise
   */
  checkOverride(
    plannedMode: InverterMode,
    plannedChargeRate: number,
    currentMetrics: MetricInstance
  ): { workMode: InverterMode; chargeRate: number } | null;

  /**
   * Gets the name of this protection for logging purposes
   */
  getName(): string;
}