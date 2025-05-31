import {InverterMode} from "./inverter-mode";

export type MetricInstance = {
  timestamp: number;
  batteryChargeRate: number;
  workModePriority: InverterMode;
  loadPower: number;
  gridPower: number;
  batteryPower: number;
  batteryCurrent: number;
  batteryChargePercent: number;
  batteryCapacity: number;
  solarPower: number;
};
