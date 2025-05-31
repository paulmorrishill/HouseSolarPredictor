import {BackendTimeSegment} from "../../time/backend-time-segment.ts";
import {ControlAction, ControllerStatus, InverterMode} from "@shared";

export interface ControllerState {
  status: ControllerStatus;
  message: string;
  currentSegment?: BackendTimeSegment;
  desiredWorkMode?: InverterMode;
  desiredChargeRate?: number;
  actualWorkMode?: InverterMode;
  actualChargeRate?: number;
  pendingAction?: ControlAction;
}

