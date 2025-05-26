using System;
using HouseSolarPredictor.EnergySupply;
using HouseSolarPredictor.Prediction;
using HouseSolarPredictor.Time;
using NodaTime;

namespace HouseSolarPredictor.Planning.Optimisers;

public class ScoringOptimiser : IPlanOptimiser
{
    public Task<List<TimeSegment>> CreateChargePlan(List<TimeSegment> segments, LocalDate date)
    {
        var sorted = segments.OrderBy(s => s.GridPrice).ThenByDescending(s => s.ExpectedSolarGeneration).ToList();
        var numberOfSegments = sorted.Count;
        var charging = 0;

        foreach (var segment in sorted)
        {
            if ((segment.ExpectedSolarGeneration - segment.ExpectedConsumption) > Kwh.Zero)
            {
                segment.Mode = OutputsMode.ChargeSolarOnly;
                charging++;
                continue;
            }

            if (charging >= (numberOfSegments / 2))
            {
                segment.Mode = OutputsMode.Discharge;
                continue;
            }


            if ((segment.ExpectedConsumption - segment.ExpectedConsumption) <= Kwh.Zero)
            {
                segment.Mode = OutputsMode.ChargeFromGridAndSolar;
                charging++;
                continue;
            }
        }

        return Task.FromResult(segments);
    }
}
