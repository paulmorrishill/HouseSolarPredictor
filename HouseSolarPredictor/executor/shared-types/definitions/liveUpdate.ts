import {MetricInstance} from "./metric-instance";
import {ControllerStatus} from "./controller-status";
import {InverterMode} from "./inverter-mode";
import {ControlAction} from "./controlAction";
import {RawTimeSegment} from "./raw-time-segment";

export interface LiveUpdate {
    controller: SerializedControllerState;
    metrics: MetricInstance;
}

export interface SerializedControllerState {
    status: ControllerStatus;
    message: string;
    currentSegment?: RawTimeSegment;
    desiredWorkMode?: InverterMode;
    desiredChargeRate?: number;
    actualWorkMode?: InverterMode;
    actualChargeRate?: number;
    pendingAction?: ControlAction;
    isInProtectionMode: boolean;
    protectionReason?: string;
}
