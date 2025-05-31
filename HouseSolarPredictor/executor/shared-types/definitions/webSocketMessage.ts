import {MetricInstance} from "./metric-instance";
import {LiveUpdate, SerializedControllerState} from "./liveUpdate";

interface BaseWebSocketMessage {
    timestamp: number;
}

export type WebSocketMessage = BaseWebSocketMessage & (
    | { type: 'controller_state'; data: SerializedControllerState }
    | { type: 'current_metrics'; data: MetricInstance }
    | { type: 'live_update'; data: LiveUpdate }
    );
