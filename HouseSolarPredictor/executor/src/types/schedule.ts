export enum OutputsMode {
  ChargeFromGridAndSolar = "ChargeFromGridAndSolar",
  ChargeSolarOnly = "ChargeSolarOnly",
  Discharge = "Discharge"
}

export interface time {
  hourStart: string;
  hourEnd: string;
}

export interface TimeSegment {
  time: time;
  expectedSolarGeneration: number; // kWh
  gridPrice: number; // pence per kWh
  expectedConsumption: number; // kWh
  startBatteryChargeKwh: number; // kWh
  endBatteryChargeKwh: number; // kWh
  mode: OutputsMode;
  wastedSolarGeneration: number; // kWh
  actualGridUsage: number; // kWh
}

export interface SystemState {
  timestamp: number;
  batteryChargeRate: number;
  workModePriority: string;
  loadPower: number;
  gridPower: number;
  batteryPower: number;
  batteryCurrent: number;
  desiredChargeRate?: number;
  desiredWorkMode?: string;
  status: "green" | "amber" | "red";
  currentSegment?: TimeSegment;
  statusMessage?: string;
}

export interface ControlAction {
  id?: number;
  timestamp: number;
  actionType: "work_mode" | "charge_rate";
  targetValue: string;
  success: boolean;
  responseMessage?: string;
  retryCount: number;
}

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
