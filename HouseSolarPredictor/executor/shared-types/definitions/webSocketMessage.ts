import {ControllerState} from "./controller-state";
import {MetricInstance} from "./metric-instance";
import {LiveUpdate} from "./liveUpdate";
import {HttpPollTrigger} from "./httpPollTrigger";
import {HistoricalMetrics} from "./historicalMetrics";

interface BaseWebSocketMessage {
    timestamp: number;
}

export type WebSocketMessage = BaseWebSocketMessage & (
    | { type: 'controller_state'; data: ControllerState }
    | { type: 'current_metrics'; data: MetricInstance }
    | { type: 'live_update'; data: LiveUpdate }
    | { type: 'historical_metrics'; data: HistoricalMetrics }
    | { type: 'http_poll_trigger'; data: HttpPollTrigger }
    );
