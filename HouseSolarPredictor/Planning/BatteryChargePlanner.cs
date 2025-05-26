using System.Collections.ObjectModel;
using HouseSolarPredictor.EnergySupply;
using HouseSolarPredictor.Load;
using HouseSolarPredictor.Time;
using NodaTime;

namespace HouseSolarPredictor.Prediction;

public class BatteryChargePlanner
{
    private readonly ISolarPredictor _solarPredictor;
    private readonly ILoadPredictor _loadPredictor;
    private readonly ISupplier _supplier;
    private IBatteryPredictor _batteryPredictor;
    private IHouseSimulator _houseSimulator;
    
    // Cache for memoization: configuration -> (cost, optimal modes for remaining segments)
    private Dictionary<string, (Gbp cost, List<OutputsMode> optimalModes)> _cache = 
        new Dictionary<string, (Gbp cost, List<OutputsMode> optimalModes)>();

    public BatteryChargePlanner(ISolarPredictor solarPredictor, ILoadPredictor loadPredictor, ISupplier supplier,
        IBatteryPredictor batteryPredictor, IHouseSimulator houseSimulator)
    {
        _houseSimulator = houseSimulator;
        _batteryPredictor = batteryPredictor;
        _supplier = supplier;
        _loadPredictor = loadPredictor;
        _solarPredictor = solarPredictor;
    }

    public async Task<List<TimeSegment>> CreateChargePlan(LocalDate date)
    {
        _cache.Clear(); // Clear cache for new day
        
        var segments = HalfHourSegments.AllSegments;
        var workingSegments = new List<TimeSegment>();
        await InitialiseDefaultSegmentsLoadFirst(date, segments, workingSegments);

        // Find optimal configuration and apply it
        var (cost, optimalModes) = await FindOptimalConfiguration(workingSegments, date, 0);
        
        // Apply the optimal modes
        for (int i = 0; i < workingSegments.Count; i++)
        {
            workingSegments[i].Mode = optimalModes[i];
        }
        
        // Run final simulation with optimal configuration
        await _houseSimulator.RunSimulation(workingSegments, date);
        
        return workingSegments;
    }

    private async Task<(Gbp cost, List<OutputsMode> optimalModes)> FindOptimalConfiguration(
        List<TimeSegment> workingSegments, LocalDate date, int segmentIndex)
    {
        await _houseSimulator.RunSimulation(workingSegments, date);

        if (segmentIndex >= workingSegments.Count)
        {
            var cost = workingSegments.CalculatePlanCost();
            return (cost, new List<OutputsMode>());
        }

        // Create cache key for current configuration
        var cacheKey = CreateCacheKey(workingSegments, segmentIndex);
        if (_cache.ContainsKey(cacheKey))
        {
            return _cache[cacheKey];
        }

        var possibleModes = new List<OutputsMode>
        {
            OutputsMode.ChargeFromGridAndSolar,
            OutputsMode.Discharge,
            OutputsMode.ChargeSolarOnly
        };

        var originalMode = workingSegments[segmentIndex].Mode;
        var bestCost = Gbp.MaxValue;
        var bestModeSequence = new List<OutputsMode>();

        // Try each possible mode for this segment
        foreach (var mode in possibleModes)
        {
            var modeHistory = workingSegments.Select(s => (int)s.Mode).ToList();
            var modeString = string.Join("", modeHistory);
            workingSegments[segmentIndex].Mode = mode;
            
            var (futureCost, futureModes) = await FindOptimalConfiguration(workingSegments, date, segmentIndex + 1);
            Console.WriteLine($"Trying {modeString}: {futureCost:F2} £");

            if (futureCost < bestCost)
            {
                bestCost = futureCost;
                bestModeSequence = new List<OutputsMode> { mode };
                bestModeSequence.AddRange(futureModes);
            }
        }

        // Restore original mode (important for other branches of recursion)
        workingSegments[segmentIndex].Mode = originalMode;
        
        // Cache the result
        var result = (bestCost, bestModeSequence);
        _cache[cacheKey] = result;
        
        return result;
    }

    private string CreateCacheKey(List<TimeSegment> segments, int fromIndex)
    {
        // Create cache key from the current state at fromIndex
        // Since we're exploring from this point forward, we need to include
        // any state that might affect future decisions
        
        if (fromIndex >= segments.Count)
            return "END";
            
        // For now, just use the segment index as the key since the segments are fixed
        // If battery state affects future decisions, you'd need to include that here
        return fromIndex.ToString() + segments[fromIndex].EndBatteryChargeKwh + segments[fromIndex].StartBatteryChargeKwh 
               + segments[fromIndex].Mode;
    }

    private async Task InitialiseDefaultSegmentsLoadFirst(LocalDate date, ReadOnlyCollection<HalfHourSegment> segments, List<TimeSegment> workingSegments)
    {
        foreach (var segment in segments)
        {
            var solarGeneration = _solarPredictor.PredictSolarEnergy(date.DayOfYear, segment);
            var gridPrice = await _supplier.GetPrice(date, segment);
            var estimatedConsumption = _loadPredictor.PredictLoad(date.DayOfYear, segment);

            if(gridPrice == null)
            {
                throw new InvalidOperationException($"No grid price found for {date} at segment {segment}");
            }
            
            if (solarGeneration < Kwh.Zero)
            {
                throw new InvalidOperationException($"Solar generation cannot be negative for {date} at segment {segment}. Value: {solarGeneration}");
            }
            
            if (estimatedConsumption < Kwh.Zero)
            {
                throw new InvalidOperationException($"Estimated consumption cannot be negative for {date} at segment {segment}. Value: {estimatedConsumption}");
            }
            
            var timeSegment = new TimeSegment
            {
                HalfHourSegment = segment,
                ExpectedSolarGeneration = solarGeneration,
                GridPrice = gridPrice,
                ExpectedConsumption = estimatedConsumption,
                StartBatteryChargeKwh = Kwh.Zero,
                EndBatteryChargeKwh = Kwh.Zero,
                Mode = OutputsMode.Discharge,
                WastedSolarGeneration = Kwh.Zero
            };

            workingSegments.Add(timeSegment);
        }
    }
}