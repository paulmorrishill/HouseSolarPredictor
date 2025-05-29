import {TimeSegment} from "./timeSegment";

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
