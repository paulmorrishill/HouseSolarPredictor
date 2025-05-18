using HouseSolarPredictor.Time;
using HouseSolarPredictor.Weather;

namespace HouseSolarPredictor.Solar
{
    /// <summary>
    /// Implementation of the solar prediction context provider
    /// </summary>
    public class SolarPredictionContextProvider : ISolarPredictionContextProvider
    {
        private readonly Dictionary<int, WeatherData> _weatherDataCache;
        private readonly DayInfo _dayInfo;

        public SolarPredictionContextProvider(Dictionary<int, WeatherData> weatherDataCache, DayInfo dayInfo)
        {
            _weatherDataCache = weatherDataCache;
            _dayInfo = dayInfo;
        }

        public SolarPredictionContext GetContext(int dayOfYear, HalfHourSegment halfHourSegment)
        {
            // Get the weather data for the hour
            var weatherData = _weatherDataCache[halfHourSegment.HourStart];

            return new SolarPredictionContext
            {
                WeatherData = weatherData,
                DayInfo = _dayInfo
            };
        }
    }

    /// <summary>
    /// Implementation of the load prediction context provider
    /// </summary>
    public class LoadPredictionContextProvider : ILoadPredictionContextProvider
    {
        private readonly Dictionary<int, WeatherData> _weatherDataCache;
        private readonly float _dailyHighTemp;
        private readonly float _dailyLowTemp;
        private readonly Dictionary<DateTime, float> _historicalConsumption;
        private readonly DateTime _targetDate;

        public LoadPredictionContextProvider(
            Dictionary<int, WeatherData> weatherDataCache,
            float dailyHighTemp,
            float dailyLowTemp,
            Dictionary<DateTime, float> historicalConsumption,
            DateTime targetDate)
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
            var dateTime = new DateTime(_targetDate.Year, _targetDate.Month, _targetDate.Day, 
                halfHourSegment.HourStart, halfHourSegment.MinuteStart, 0);

            // Get the weather data for the hour
            var weatherData = _weatherDataCache[halfHourSegment.HourStart];

            // Get historical load data with defaults
            _historicalConsumption.TryGetValue(dateTime.AddDays(-1), out var prevDayLoad);
            _historicalConsumption.TryGetValue(dateTime.AddDays(-7), out var prevWeekLoad);

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
}