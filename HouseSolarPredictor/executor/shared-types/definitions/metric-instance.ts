export type MetricInstance = {
  timestamp: number;
  batteryChargeRate: number;
  workModePriority: string;
  loadPower: number;
  gridPower: number;
  batteryPower: number;
  batteryCurrent: number;
  // Percent
  batteryCharge: number;
  batteryCapacity: number;
};
