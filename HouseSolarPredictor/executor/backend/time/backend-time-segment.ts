import {OutputsMode} from "@shared";

export interface BackendTimeSegment {
    time: {
        segmentStart: Temporal.Instant;
        segmentEnd: Temporal.Instant;
    };
    expectedSolarGeneration: number; // kWh
    gridPrice: number; // pence per kWh
    expectedConsumption: number; // kWh
    startBatteryChargeKwh: number; // kWh
    endBatteryChargeKwh: number; // kWh
    mode: OutputsMode;
    wastedSolarGeneration: number; // kWh
    actualGridUsage: number; // kWh
    cost: number;
}
