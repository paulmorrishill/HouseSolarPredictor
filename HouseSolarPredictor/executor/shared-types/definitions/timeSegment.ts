import {OutputsMode} from "./outputsMode";

export interface TimeSegment {
  time: {
    segmentStart: string;  // ISO datetime string (YYYY-MM-DDTHH:MM:SS)
    segmentEnd: string;    // ISO datetime string (YYYY-MM-DDTHH:MM:SS)
  };
  expectedSolarGeneration: number; // kWh
  gridPrice: number; // pence per kWh
  expectedConsumption: number; // kWh
  startBatteryChargeKwh: number; // kWh
  endBatteryChargeKwh: number; // kWh
  mode: OutputsMode;
  wastedSolarGeneration: number; // kWh
  actualGridUsage: number; // kWh
  cost?: {
    poundsAmount: number;
  };
}

