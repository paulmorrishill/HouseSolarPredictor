using NodaTime;

namespace HouseSolarPredictor.Prediction;

public interface IPlanOptimiser
{
    Task<List<TimeSegment>> CreateChargePlan(List<TimeSegment> segments, LocalDate date);
}