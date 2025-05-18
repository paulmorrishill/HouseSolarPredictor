namespace HouseSolarPredictor.Time;

/// <summary>
/// Represents a time segment with a start and end time
/// </summary>
public class HalfHourSegment
{
    public int HourStart { get; }
    public int MinuteStart { get; }
    public int HourEnd { get; }
    public int MinuteEnd { get; }

    // Private constructor - only available within implementation
    public HalfHourSegment(int hourStart, int minuteStart)
    {
        HourStart = hourStart;
        MinuteStart = minuteStart;
        
        int endHour = hourStart;
        int endMinute = minuteStart + 30;
        
        if (endMinute >= 60)
        {
            endMinute -= 60;
            endHour = (endHour + 1) % 24;
        }
        HourEnd = endHour;
        MinuteEnd = endMinute;
    }

    /// <summary>
    /// Converts this time segment to a DateTime range given a specific date
    /// </summary>
    /// <param name="date">The date to use</param>
    /// <returns>A tuple containing start and end DateTimes</returns>
    public (DateTime Start, DateTime End) ToDateTime(DateTime date)
    {
        DateTime start = new DateTime(date.Year, date.Month, date.Day, HourStart, MinuteStart, 0);
        DateTime end = new DateTime(date.Year, date.Month, date.Day, HourEnd, MinuteEnd, 0);
        
        // Handle case where end time is on the next day
        if (end < start)
        {
            end = end.AddDays(1);
        }
        
        return (start, end);
    }

    public override string ToString()
    {
        return $"{HourStart:D2}:{MinuteStart:D2} - {HourEnd:D2}:{MinuteEnd:D2}";
    }

    public static HalfHourSegment FromDateTime(DateTime validFrom)
    {
        if(validFrom.Minute != 0 && validFrom.Minute != 30)
        {
            throw new ArgumentException("DateTime must be on the hour or half-hour");
        }
        return new HalfHourSegment(validFrom.Hour, validFrom.Minute);
    }
}