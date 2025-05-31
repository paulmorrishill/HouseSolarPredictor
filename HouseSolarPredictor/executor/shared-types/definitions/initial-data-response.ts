import {MetricInstance} from "./metric-instance";
import {StatusResponse} from "./api-response/status-response";
import {RawTimeSegment} from "./raw-time-segment";

export interface InitialDataResponse {
    status: StatusResponse;
    metrics: MetricInstance[];
    schedule: RawTimeSegment[];
}
