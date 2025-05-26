using NodaTime;

namespace HouseSolarPredictor.Solar;

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
    public LocalDateTime DateTime { get; set; }
        
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