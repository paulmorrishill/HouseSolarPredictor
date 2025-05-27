import { TimeSegment, OutputsMode } from "../types/schedule.ts";

export class ScheduleService {
  private schedule: TimeSegment[] = [];
  private schedulePath: string;

  constructor(schedulePath: string) {
    this.schedulePath = schedulePath;
  }

  async loadSchedule(): Promise<void> {
    try {
      const scheduleText = await Deno.readTextFile(this.schedulePath);
      const rawSchedule = JSON.parse(scheduleText);
      
      if (!Array.isArray(rawSchedule)) {
        throw new Error("Schedule must be an array of TimeSegment objects");
      }

      this.schedule = rawSchedule.map(this.validateAndTransformSegment);
      console.log(`Loaded ${this.schedule.length} time segments from schedule`);
    } catch (error) {
      console.error(`Failed to load schedule from ${this.schedulePath}:`, error);
      throw error;
    }
  }

  private validateAndTransformSegment(segment: any): TimeSegment {
    // Validate required fields
    if (!segment.time?.segmentStart || !segment.time?.segmentEnd) {
      throw new Error("TimeSegment must have time with hourStart and hourEnd");
    }

    if (!Object.values(OutputsMode).includes(segment.mode)) {
      throw new Error(`Invalid mode: ${segment.mode}. Must be one of: ${Object.values(OutputsMode).join(", ")}`);
    }

    return {
      time: {
        hourStart: segment.time.segmentStart,
        hourEnd: segment.time.segmentEnd
      },
      expectedSolarGeneration: segment.expectedSolarGeneration || 0,
      gridPrice: segment.gridPrice || 0,
      expectedConsumption: segment.expectedConsumption || 0,
      startBatteryChargeKwh: segment.startBatteryChargeKwh || 0,
      endBatteryChargeKwh: segment.endBatteryChargeKwh || 0,
      mode: segment.mode,
      wastedSolarGeneration: segment.wastedSolarGeneration || 0,
      actualGridUsage: segment.actualGridUsage || 0
    };
  }

  getCurrentTimeSegment(): TimeSegment | null {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    return this.schedule.find(segment => {
      const startParts = segment.time.hourStart.split(':');
      const endParts = segment.time.hourEnd.split(':');
      
      const startHour = parseInt(startParts[0]);
      const startMinute = parseInt(startParts[1]);
      const endHour = parseInt(endParts[0]);
      const endMinute = parseInt(endParts[1]);
      
      const startTime = startHour * 60 + startMinute;
      let endTime = endHour * 60 + endMinute;
      const currentTime = currentHour * 60 + currentMinute;
      
      // Handle segments that cross midnight
      if (endTime <= startTime) {
        endTime += 24 * 60; // Add 24 hours
        if (currentTime < startTime) {
          return currentTime + 24 * 60 >= startTime && currentTime + 24 * 60 < endTime;
        }
      }
      
      return currentTime >= startTime && currentTime < endTime;
    }) || null;
  }

  getNextTimeSegment(): TimeSegment | null {
    const current = this.getCurrentTimeSegment();
    if (!current) return null;

    const currentIndex = this.schedule.findIndex(s => s === current);
    if (currentIndex === -1 || currentIndex === this.schedule.length - 1) {
      return this.schedule[0]; // Return first segment (next day)
    }

    return this.schedule[currentIndex + 1];
  }

  getAllSegments(): TimeSegment[] {
    return [...this.schedule];
  }

  getSegmentByTime(hour: number, minute: number): TimeSegment | null {
    const targetTime = hour * 60 + minute;
    
    return this.schedule.find(segment => {
      const startParts = segment.time.hourStart.split(':');
      const endParts = segment.time.hourEnd.split(':');
      
      const startHour = parseInt(startParts[0]);
      const startMinute = parseInt(startParts[1]);
      const endHour = parseInt(endParts[0]);
      const endMinute = parseInt(endParts[1]);
      
      const startTime = startHour * 60 + startMinute;
      let endTime = endHour * 60 + endMinute;
      
      // Handle segments that cross midnight
      if (endTime <= startTime) {
        endTime += 24 * 60;
        if (targetTime < startTime) {
          return targetTime + 24 * 60 >= startTime && targetTime + 24 * 60 < endTime;
        }
      }
      
      return targetTime >= startTime && targetTime < endTime;
    }) || null;
  }

  isScheduleLoaded(): boolean {
    return this.schedule.length > 0;
  }
}
