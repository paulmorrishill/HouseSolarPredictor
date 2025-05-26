using HouseSolarPredictor.Load;
using HouseSolarPredictor.Prediction;
using HouseSolarPredictor.Time;
using NodaTime;

namespace HouseSolarPredictor.Planning.Optimisers;

public class ScoringOptimiser : IPlanOptimiser
{
    private HouseSimulator houseSimulator;
    private Kwh batteryCapacity;

    public ScoringOptimiser(HouseSimulator houseSimulator, Kwh batteryCapacity)
    {
        this.houseSimulator = houseSimulator;
        this.batteryCapacity = batteryCapacity;
    }

    public async Task<List<TimeSegment>> CreateChargePlan(List<TimeSegment> segments, LocalDate date)
    {
        var maxPrice = segments.MaxBy(s => s.GridPrice)?.GridPrice;
        var minPrice = segments.MinBy(s => s.GridPrice)?.GridPrice;
        if (maxPrice == minPrice)
        {
            foreach (var segment in segments)
            {
                segment.Mode = OutputsMode.Discharge;
            }
            return segments;
        }


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

            if ((segment.ExpectedSolarGeneration - segment.ExpectedConsumption) <= Kwh.Zero)
            {
                segment.Mode = OutputsMode.ChargeFromGridAndSolar;
                charging++;
                continue;
            }
        }

        
        await houseSimulator.RunSimulation(segments, date);

        foreach (var segment in segments)
        {
            if (segment.StartBatteryChargeKwh < batteryCapacity)
            {
                continue;
            }

            if ((segment.ExpectedSolarGeneration - segment.ExpectedConsumption) > Kwh.Zero)
            {
                segment.Mode = OutputsMode.Discharge;
            }
        }

        var costs = new List<(TimeSegment, Gbp)>();
        foreach (var segment in segments)
        {
            costs.Add((segment, segment.GridPrice * segment.ActualGridUsage));
        }

        var expensiveFirst = costs.OrderByDescending(t => t.Item2.PoundsAmount).ToList();
        var cheapestPrice = costs.Last().Item1.GridPrice;

        foreach (var (segment, cost) in expensiveFirst)
        {
            if (segment.GridPrice == cheapestPrice)
            {
                continue;
            }
            if ((segment.ExpectedSolarGeneration - segment.ExpectedConsumption) <= Kwh.Zero)
            {
                segment.Mode = OutputsMode.Discharge;
            }
        }

        return segments;
    }
}
