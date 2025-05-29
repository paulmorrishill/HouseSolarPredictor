// DateTime utility interface for datetime operations
export interface DateTimeUtilities {
  parseDateTime(dateTimeString: string): Date;
  isCurrentTimeInRange(start: Date, end: Date): boolean;
  calculateTimeUntil(targetDateTime: Date): string;
  formatDateTime(date: Date): string;
  formatTimeOnly(date: Date): string;
}
