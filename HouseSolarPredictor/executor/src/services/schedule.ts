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
    // Validate datetime format - NO backward compatibility
    if (!segment.time?.segmentStart || !segment.time?.segmentEnd) {
      throw new Error("TimeSegment must have time with segmentStart and segmentEnd datetime strings");
    }

    // Validate ISO datetime format
    const startDate = new Date(segment.time.segmentStart);
    const endDate = new Date(segment.time.segmentEnd);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new Error(`Invalid datetime format. Expected ISO format (YYYY-MM-DDTHH:MM:SS), got: ${segment.time.segmentStart}, ${segment.time.segmentEnd}`);
    }

    if (endDate <= startDate) {
      throw new Error("Segment end time must be after start time");
    }

    if (!Object.values(OutputsMode).includes(segment.mode)) {
      throw new Error(`Invalid mode: ${segment.mode}. Must be one of: ${Object.values(OutputsMode).join(", ")}`);
    }

    return {
      time: {
        segmentStart: segment.time.segmentStart,
        segmentEnd: segment.time.segmentEnd
      },
      expectedSolarGeneration: segment.expectedSolarGeneration || 0,
      gridPrice: segment.gridPrice || 0,
      expectedConsumption: segment.expectedConsumption || 0,
      startBatteryChargeKwh: segment.startBatteryChargeKwh || 0,
      endBatteryChargeKwh: segment.endBatteryChargeKwh || 0,
      mode: segment.mode,
      wastedSolarGeneration: segment.wastedSolarGeneration || 0,
      actualGridUsage: segment.actualGridUsage || 0,
      cost: segment.cost
    };
  }

  getCurrentTimeSegment(): TimeSegment | null {
    const now = new Date();
    
    return this.schedule.find(segment => {
      const startDate = new Date(segment.time.segmentStart);
      const endDate = new Date(segment.time.segmentEnd);
      
      return now >= startDate && now < endDate;
    }) || null;
  }

  getNextTimeSegment(): TimeSegment | null {
    const now = new Date();
    
    // Find all future segments and sort by start time
    const futureSegments = this.schedule
      .filter(segment => new Date(segment.time.segmentStart) > now)
      .sort((a, b) => new Date(a.time.segmentStart).getTime() - new Date(b.time.segmentStart).getTime());
    
    return futureSegments[0] || null;
  }

  getAllSegments(): TimeSegment[] {
    return [...this.schedule];
  }

  getSegmentByDateTime(targetDateTime: Date): TimeSegment | null {
    return this.schedule.find(segment => {
      const startDate = new Date(segment.time.segmentStart);
      const endDate = new Date(segment.time.segmentEnd);
      
      return targetDateTime >= startDate && targetDateTime < endDate;
    }) || null;
  }

  getScheduleForDateRange(startDate: Date, endDate: Date): TimeSegment[] {
    return this.schedule.filter(segment => {
      const segmentStart = new Date(segment.time.segmentStart);
      const segmentEnd = new Date(segment.time.segmentEnd);
      
      return (segmentStart >= startDate && segmentStart <= endDate) ||
             (segmentEnd >= startDate && segmentEnd <= endDate) ||
             (segmentStart <= startDate && segmentEnd >= endDate);
    });
  }

  getAllSegmentsForDate(targetDate: Date): TimeSegment[] {
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    return this.getScheduleForDateRange(startOfDay, endOfDay);
  }

  isScheduleLoaded(): boolean {
    return this.schedule.length > 0;
  }
}
