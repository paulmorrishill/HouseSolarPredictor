import {OutputsMode} from "@shared";
import type {BackendTimeSegment} from "../../time/backend-time-segment.ts";
import type {RawTimeSegment} from  "@shared";
import {Logger} from "../logger.ts";

export class ScheduleService {
  private schedule: BackendTimeSegment[] = [];
  private schedulePath: string;
  private scheduleModifiedDate: Temporal.Instant | null = null;
  private logger: Logger;

  constructor(schedulePath: string) {
    this.schedulePath = schedulePath;
    this.logger = new Logger();
    setInterval(() => {
      const scheduleModified = this.getScheduleModifiedDate();
      if (!(scheduleModified && (!this.scheduleModifiedDate || Temporal.Instant.compare(scheduleModified, this.scheduleModifiedDate) > 0))) {
        return;
      }
      console.log(`🔄 Schedule modified at ${scheduleModified}, reloading...`);
      this.loadSchedule().catch(error => {
        console.error(`❌ Error loading schedule: ${error.message}`);
      });
    }, 1000);
  }

  private getScheduleModifiedDate(): Temporal.Instant {
    const scheduleModified = Temporal.Instant.fromEpochMilliseconds(Deno.statSync(this.schedulePath).mtime!.getTime());
    return scheduleModified;
  }

  async loadSchedule(): Promise<void> {
    const scheduleText = await Deno.readTextFile(this.schedulePath);
    const rawSchedule = JSON.parse(scheduleText) as RawTimeSegment[];

    if (!Array.isArray(rawSchedule)) {
      throw new Error("Schedule must be an array of TimeSegment objects");
    }

    const previousSegmentCount = this.schedule.length;
    this.schedule = rawSchedule.map(this.validateAndTransformSegment);
    this.scheduleModifiedDate = this.getScheduleModifiedDate();
    console.log(`✅ Loaded ${this.schedule.length} time segments from schedule`);
    
    this.logger.logSignificant("SCHEDULE_LOADED", {
      segmentCount: this.schedule.length,
      previousSegmentCount,
      schedulePath: this.schedulePath,
      modifiedDate: this.scheduleModifiedDate?.toString()
    });
  }

  private validateAndTransformSegment(segment: RawTimeSegment): BackendTimeSegment {
    // Validate datetime format - NO backward compatibility
    if (!segment.time?.segmentStart || !segment.time?.segmentEnd) {
      throw new Error("TimeSegment must have time with segmentStart and segmentEnd datetime strings");
    }

    // Validate ISO datetime format using Temporal
    let startDate: Temporal.Instant;
    let endDate: Temporal.Instant;
    
    startDate = Temporal.Instant.from(segment.time.segmentStart);
    endDate = Temporal.Instant.from(segment.time.segmentEnd);

    if (Temporal.Instant.compare(endDate, startDate) <= 0) {
      throw new Error("Segment end time must be after start time");
    }

    if (!Object.values(OutputsMode).includes(segment.mode)) {
      throw new Error(`Invalid mode: ${segment.mode}. Must be one of: ${Object.values(OutputsMode).join(", ")}`);
    }

    return {
      time: {
        segmentStart: startDate,
        segmentEnd: endDate
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

  getCurrentTimeSegment(): BackendTimeSegment | null {
    const utcNow = Temporal.Now.instant();

    return this.schedule.find(segment => {
      const startDate = Temporal.Instant.from(segment.time.segmentStart);
      const endDate = Temporal.Instant.from(segment.time.segmentEnd);

      return Temporal.Instant.compare(utcNow, startDate) >= 0 && Temporal.Instant.compare(utcNow, endDate) < 0;
    }) || null;
  }

  getNextTimeSegment(): BackendTimeSegment | null {
    const utcNow = Temporal.Now.instant();

    // Find all future segments and sort by start time
    const futureSegments = this.schedule
      .filter(segment => {
        const startDate = Temporal.Instant.from(segment.time.segmentStart);
        return Temporal.Instant.compare(startDate, utcNow) > 0;
      })
      .sort((a, b) => {
        const startA = Temporal.Instant.from(a.time.segmentStart);
        const startB = Temporal.Instant.from(b.time.segmentStart);
        return Temporal.Instant.compare(startA, startB);
      });
    
    return futureSegments[0] || null;
  }

  getAllSegments(): BackendTimeSegment[] {
    return [...this.schedule];
  }

  getScheduleForDateRange(startDate: Temporal.Instant, endDate: Temporal.Instant): BackendTimeSegment[] {
    return this.schedule.filter(segment => {
      const segmentStart = Temporal.Instant.from(segment.time.segmentStart);
      const segmentEnd = Temporal.Instant.from(segment.time.segmentEnd);

      return (Temporal.Instant.compare(segmentStart, startDate) >= 0 && Temporal.Instant.compare(segmentStart, endDate) <= 0) ||
          (Temporal.Instant.compare(segmentEnd, startDate) >= 0 && Temporal.Instant.compare(segmentEnd, endDate) <= 0) ||
          (Temporal.Instant.compare(segmentStart, startDate) <= 0 && Temporal.Instant.compare(segmentEnd, endDate) >= 0);
    });
  }

  getAllSegmentsForDate(targetDate: Temporal.PlainDate): BackendTimeSegment[] {
    const startOfDay = targetDate.toZonedDateTime({
      timeZone: 'Europe/London',
      plainTime: Temporal.PlainTime.from('00:00:00')
    }).toInstant();
    
    const endOfDay = targetDate.toZonedDateTime({
      timeZone: 'Europe/London',
      plainTime: Temporal.PlainTime.from('23:59:59.999')
    }).toInstant();

    console.log(`🔍 Fetching schedule for date: ${targetDate.toString()} from ${startOfDay.toString()} to ${endOfDay.toString()}`);
    return this.getScheduleForDateRange(startOfDay, endOfDay);
  }

  isScheduleLoaded(): boolean {
    return this.schedule.length > 0;
  }
}
