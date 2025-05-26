using HouseSolarPredictor.Time;

namespace HouseSolarPredictor.Solar;

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