import { RawTimeSegment } from "@shared/index.ts";
import { BackendTimeSegment } from "../../time/backend-time-segment.ts";


export function convertBackendTimeSegmentToRawSegment(timeSegment: BackendTimeSegment | undefined): RawTimeSegment | undefined {
  if (!timeSegment) {
    return undefined;
  }
  return {
    ...timeSegment,
    time: {
      segmentStart: timeSegment.time.segmentStart.toString(),
      segmentEnd: timeSegment.time.segmentEnd.toString()
    }
  };
}
