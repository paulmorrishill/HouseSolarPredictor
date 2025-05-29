import {TimeSegment} from "./timeSegment";

import {ControllerStatus} from "./controller-status";
import {ControlAction} from "./controlAction";
import {InverterMode} from "./inverter-mode";

export interface ControllerState {
  status: ControllerStatus;
  message: string;
  currentSegment?: TimeSegment;
  desiredWorkMode?: InverterMode;
  desiredChargeRate?: number;
  actualWorkMode?: InverterMode;
  actualChargeRate?: number;
  pendingAction?: ControlAction;
  isInProtectionMode: boolean;
  protectionReason?: string;
}

