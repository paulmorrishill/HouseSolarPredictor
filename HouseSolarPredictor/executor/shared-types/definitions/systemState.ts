import {TimeSegment} from "./timeSegment";
import {InverterMode} from "./inverter-mode";

export interface SystemState2 {
  timestamp: number;
  batteryChargeRate: number;
  workModePriority: InverterMode;
  loadPower: number;
  gridPower: number;
  batteryPower: number;
  batteryCurrent: number;
  desiredChargeRate?: number;
  desiredWorkMode?: InverterMode;
  status: "green" | "amber" | "red";
  currentSegment?: TimeSegment;
  statusMessage?: string;
}
