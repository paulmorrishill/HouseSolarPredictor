using HouseSolarPredictor.Time;

namespace HouseSolarPredictor.Solar;

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