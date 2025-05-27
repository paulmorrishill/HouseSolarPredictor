using System.Collections.ObjectModel;

namespace HouseSolarPredictor.Time;

/// <summary>
/// Contains all instances of ChargeSegment
/// </summary>
public static class HalfHourSegments
{
    /// <summary>
    /// Collection of all 48 half-hour segments in a day
    /// </summary>
    public static readonly ReadOnlyCollection<HalfHourSegment> AllSegments;

    /// <summary>
    /// Static constructor that initializes all 48 instances
    /// </summary>
    static HalfHourSegments()
    {
        var segments = new List<HalfHourSegment>(48);
        
        for (int hour = 0; hour < 24; hour++)
        {
            // First half-hour of this hour (XX:00 - XX:30)
            segments.Add(CreateHalfHourSegment(hour, 0));
            
            segments.Add(CreateHalfHourSegment(hour, 30));
        }
        
        AllSegments = segments.AsReadOnly();
    }

    /// <summary>
    /// Creates a ChargeSegment for a half-hour block
    /// </summary>
    private static HalfHourSegment CreateHalfHourSegment(int hour, int minute)
    {
        return new HalfHourSegment(hour, minute);
    }
    
    /// <summary>
    /// Gets a segment by its index (0-47)
    /// </summary>
    public static HalfHourSegment GetByIndex(int index)
    {
        if (index < 0 || index >= AllSegments.Count)
        {
            throw new ArgumentOutOfRangeException(nameof(index), "Index must be between 0 and 47");
        }
        
        return AllSegments[index];
    }
    
    /// <summary>
    /// Gets a segment by hour and minute
    /// </summary>
    public static HalfHourSegment GetByTime(int hour, int minute)
    {
        // Validate input
        if (hour < 0 || hour >= 24)
        {
            throw new ArgumentOutOfRangeException(nameof(hour), "Hour must be between 0 and 23");
        }
        
        // We only support 0 and 30 for minutes in this implementation
        if (minute != 0 && minute != 30)
        {
            throw new ArgumentOutOfRangeException(nameof(minute), "Minute must be either 0 or 30");
        }
        
        // Calculate index: for each hour we have 2 segments, and for minute=30 we add 1
        int index = hour * 2 + (minute == 30 ? 1 : 0);
        
        return AllSegments[index];
    }
}