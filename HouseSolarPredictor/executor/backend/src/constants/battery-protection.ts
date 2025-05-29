/**
 * Battery Protection Constants
 * 
 * These constants define the battery charge thresholds for the protection system
 * that prevents battery damage from over-discharge.
 */

export const BATTERY_PROTECTION = {
  /** 
   * Discharge prevention threshold (%)
   * When battery charge <= this value, Discharge mode is not allowed
   */
  DISCHARGE_THRESHOLD: 4,
  
  /** 
   * Critical battery threshold (%)
   * When battery charge <= this value, charge rate is overridden to minimum
   */
  CRITICAL_THRESHOLD: 3,
  
  /** 
   * Recovery threshold (%)
   * Battery must reach this level before exiting protection mode
   */
  RECOVERY_THRESHOLD: 4,
  
  /** 
   * Minimum charge rate (%)
   * Applied when battery is at critical threshold
   */
  MIN_CHARGE_RATE: 1
} as const;
