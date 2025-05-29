import {MetricInstance} from "./metric-instance";
import {TimeSegment} from "./timeSegment";
import {StatusResponse} from "./api-response/status-response";

export interface InitialDataResponse {
    status: StatusResponse;
    metrics: MetricInstance[];
    schedule: TimeSegment[];
}
