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
}