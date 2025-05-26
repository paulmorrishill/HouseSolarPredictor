namespace HouseSolarPredictor.Weather;

public class DayInfo
{
    public float DaylightDuration { get; set; }
    public float SunshineDuration { get; set; }
    public int SunriseHour { get; set; }
    public int SunriseMinute { get; set; }
    public int SunsetHour { get; set; }
    public int SunsetMinute { get; set; }

    // Helper method to convert to dictionary for backward compatibility
    public Dictionary<string, float> ToDictionary()
    {
        var dict = new Dictionary<string, float>
        {
            { "daylight_duration (s)", DaylightDuration },
            { "sunshine_duration (s)", SunshineDuration },
            { "sunrise_hour", SunriseHour },
            { "sunrise_minute", SunriseMinute },
            { "sunset_hour", SunsetHour },
            { "sunset_minute", SunsetMinute }
        };
        return dict;
    }
}