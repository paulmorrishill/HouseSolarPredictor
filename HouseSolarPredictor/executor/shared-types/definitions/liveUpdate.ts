import {ControllerState} from "./controller-state";
import {MetricInstance} from "./metric-instance";

export interface LiveUpdate {
    controller: ControllerState;
    metrics: MetricInstance;
}
