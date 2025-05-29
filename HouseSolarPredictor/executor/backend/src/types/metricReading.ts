export interface MetricReading {
  id?: number;
  timestamp: number;
  batteryChargeRate?: number;
  workModePriority?: string;
  loadPower?: number;
  gridPower?: number;
  batteryPower?: number;
  batteryCurrent?: number;
  batteryCharge?: number;
}
