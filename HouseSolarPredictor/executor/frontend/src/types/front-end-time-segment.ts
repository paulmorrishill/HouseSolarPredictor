import { Temporal } from "@js-temporal/polyfill";
import {OutputsMode} from "@shared";

export interface FrontEndTimeSegment {
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

export type Schedule = FrontEndTimeSegment[];
