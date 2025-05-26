using HouseSolarPredictor.Prediction;
using NodaTime;

namespace HouseSolarPredictor.Planning.Optimisers;

public class DoNothingOptimiser : IPlanOptimiser
{
    public Task<List<TimeSegment>> CreateChargePlan(List<TimeSegment> segments, LocalDate date)
    {
        return Task.FromResult(segments);
    }
}

