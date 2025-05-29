import {SystemStatus} from "./systemStatus";
import {MetricInstance} from "./metric-instance";
import {TimeSegment} from "./timeSegment";

export interface InitialDataResponse {
    status: SystemStatus | null;
    metrics: MetricInstance[] | null;
    schedule: TimeSegment[] | null;
}
