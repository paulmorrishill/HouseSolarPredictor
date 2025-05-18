using HouseSolarPredictor.Time;
using HouseSolarPredictor.Weather;

namespace HouseSolarPredictor.Solar
{
    /// <summary>
    /// Context data for solar energy prediction
    /// </summary>
    public class SolarPredictionContext
    {
        /// <summary>
        /// Weather data for the prediction time
        /// </summary>
        public WeatherData WeatherData { get; set; }
        
        /// <summary>
        /// Day information for the prediction day
        /// </summary>
        public DayInfo DayInfo { get; set; }
    }

    /// <summary>
    /// Provider interface for solar prediction context
    /// </summary>
    public interface ISolarPredictionContextProvider
    {
        /// <summary>
        /// Gets the solar prediction context for a specific day and time segment
        /// </summary>
        SolarPredictionContext GetContext(int dayOfYear, HalfHourSegment halfHourSegment);
    }

    /// <summary>
    /// Context data for load prediction
    /// </summary>
    public class LoadPredictionContext
    {
        /// <summary>
        /// Current temperature at the prediction time
        /// </summary>
        public float Temperature { get; set; }
        
        /// <summary>
        /// Date and time for the prediction
        /// </summary>
        public DateTime DateTime { get; set; }
        
        /// <summary>
        /// Daily high temperature
        /// </summary>
        public float DailyHighTemp { get; set; }
        
        /// <summary>
        /// Daily low temperature
        /// </summary>
        public float DailyLowTemp { get; set; }
        
        /// <summary>
        /// Load from previous day at same time
        /// </summary>
        public float PrevDayLoad { get; set; }
        
        /// <summary>
        /// Load from previous week at same time
        /// </summary>
        public float PrevWeekLoad { get; set; }
    }

    /// <summary>
    /// Provider interface for load prediction context
    /// </summary>
    public interface ILoadPredictionContextProvider
    {
        /// <summary>
        /// Gets the load prediction context for a specific day and time segment
        /// </summary>
        LoadPredictionContext GetContext(int dayOfYear, HalfHourSegment halfHourSegment);
    }
}