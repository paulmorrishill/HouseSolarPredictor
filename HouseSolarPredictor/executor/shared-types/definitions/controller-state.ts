import {TimeSegment} from "./timeSegment";

import {ControllerStatus} from "./controller-status";
import {ControlAction} from "./controlAction";

export interface ControllerState {
  status: ControllerStatus;
  message: string;
  currentSegment?: TimeSegment;
  desiredWorkMode?: string;
  desiredChargeRate?: number;
  actualWorkMode?: string;
  actualChargeRate?: number;
  pendingAction?: ControlAction;
  isInProtectionMode?: boolean;
  protectionReason?: string;
}

