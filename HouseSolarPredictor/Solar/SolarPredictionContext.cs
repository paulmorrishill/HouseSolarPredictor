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
}