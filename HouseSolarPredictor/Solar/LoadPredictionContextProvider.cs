using HouseSolarPredictor.Time;
using HouseSolarPredictor.Weather;
using NodaTime;

namespace HouseSolarPredictor.Solar;

/// <summary>
/// Implementation of the load prediction context provider
/// </summary>
public class LoadPredictionContextProvider : ILoadPredictionContextProvider
{
    private readonly Dictionary<int, WeatherData> _weatherDataCache;
    private readonly float _dailyHighTemp;
    private readonly float _dailyLowTemp;
    private readonly Dictionary<LocalDateTime, float> _historicalConsumption;
    private readonly LocalDate _targetDate;

    public LoadPredictionContextProvider(
        Dictionary<int, WeatherData> weatherDataCache,
        float dailyHighTemp,
        float dailyLowTemp,
        Dictionary<LocalDateTime, float> historicalConsumption,
        LocalDate targetDate)
    {
        _weatherDataCache = weatherDataCache;
        _dailyHighTemp = dailyHighTemp;
        _dailyLowTemp = dailyLowTemp;
        _historicalConsumption = historicalConsumption;
        _targetDate = targetDate;
    }

    public LoadPredictionContext GetContext(int dayOfYear, HalfHourSegment halfHourSegment)
    {
        // Create the date time for this segment
        var dateTime = new LocalDateTime(_targetDate.Year, _targetDate.Month, _targetDate.Day, 
            halfHourSegment.HourStart, halfHourSegment.MinuteStart, 0);

        // Get the weather data for the hour
        var weatherData = _weatherDataCache[halfHourSegment.HourStart];

        // Get historical load data with defaults
        _historicalConsumption.TryGetValue(dateTime.PlusDays(-1), out var prevDayLoad);
        _historicalConsumption.TryGetValue(dateTime.PlusDays(-7), out var prevWeekLoad);

        return new LoadPredictionContext
        {
            Temperature = weatherData.Temperature,
            DateTime = dateTime,
            DailyHighTemp = _dailyHighTemp,
            DailyLowTemp = _dailyLowTemp,
            PrevDayLoad = prevDayLoad,
            PrevWeekLoad = prevWeekLoad
        };
    }
}