using System.Text;
using HouseSolarPredictor.EnergySupply;
using HouseSolarPredictor.Load;
using HouseSolarPredictor.Time;
using NodaTime;

namespace HouseSolarPredictor.Prediction;

public class DynamicProgrammingPlanOptimiser : IPlanOptimiser
{
    private IHouseSimulator _houseSimulator;
    
    // More efficient cache structure - using battery state as key  
    private Dictionary<(int segmentIndex, Kwh batteryCharge), (Gbp cost, List<OutputsMode> optimalModes)> _cache = 
        new ();

    private ILogger _logger;
    private List<TimeSegment> _baseSegments; // Cache base segments to avoid recreation
    private IBatteryPredictor _batteryPredictor;

    public DynamicProgrammingPlanOptimiser(ILogger logger, IHouseSimulator houseSimulator, IBatteryPredictor batteryPredictor)
    {
        _batteryPredictor = batteryPredictor;
        _logger = logger;
        _houseSimulator = houseSimulator;
    }

    public async Task<List<TimeSegment>> CreateChargePlan(List<TimeSegment> segments, LocalDate date)
    {
        _cache.Clear();
        _baseSegments = new List<TimeSegment>();
        // Start optimization from segment 0 with initial battery charge
        var initialBatteryCharge = _baseSegments.First().StartBatteryChargeKwh;
        var (cost, optimalModes) = await FindOptimalConfigurationIterative(_baseSegments, date, initialBatteryCharge);
        
        // Apply optimal modes
        for (int i = 0; i < _baseSegments.Count; i++)
        {
            _baseSegments[i].Mode = optimalModes[i];
        }
        
        // Final simulation
        await _houseSimulator.RunSimulation(_baseSegments, date);
        
        _logger.Log($"Optimal solution found with cost: {cost:F2} £");
        return _baseSegments;
    }

    private async Task<(Gbp cost, List<OutputsMode> optimalModes)> FindOptimalConfigurationIterative(
        List<TimeSegment> baseSegments, LocalDate date, Kwh initialBatteryCharge)
    {
        // Use dynamic programming with forward iteration instead of recursion
        var dp = new Dictionary<(int segmentIndex, Kwh batteryCharge), (Gbp cost, OutputsMode mode)>();
        
        // Initialize DP table for the last segment
        var lastSegmentIndex = baseSegments.Count - 1;
        var possibleModes = GetPossibleModes();
        
        // Work backwards from the last segment
        for (int segmentIndex = lastSegmentIndex; segmentIndex >= 0; segmentIndex--)
        {
            var possibleBatteryStates = GetPossibleBatteryStates(segmentIndex, baseSegments);
            
            foreach (var batteryState in possibleBatteryStates)
            {
                var bestCost = Gbp.MaxValue;
                var bestMode = OutputsMode.Discharge;
                
                foreach (var mode in possibleModes)
                {
                    var cost = await CalculateCostForModeAndState(baseSegments, segmentIndex, batteryState, mode, dp, date);
                    
                    if (cost < bestCost)
                    {
                        bestCost = cost;
                        bestMode = mode;
                    }
                }
                
                dp[(segmentIndex, batteryState)] = (bestCost, bestMode);
            }
        }
        
        // Reconstruct optimal path
        var optimalModes = new List<OutputsMode>();
        var currentBatteryCharge = initialBatteryCharge;
        var totalCost = Gbp.Zero;
        
        for (int i = 0; i < baseSegments.Count; i++)
        {
            var key = (i, RoundBatteryCharge(currentBatteryCharge));
            if (dp.ContainsKey(key))
            {
                var (cost, mode) = dp[key];
                optimalModes.Add(mode);
                
                // Simulate to get next battery state
                var tempSegment = CloneSegment(baseSegments[i]);
                tempSegment.Mode = mode;
                tempSegment.StartBatteryChargeKwh = currentBatteryCharge;
                
                SimulateSingleSegment(tempSegment);
                currentBatteryCharge = tempSegment.EndBatteryChargeKwh;
                
                if (i == 0) totalCost = cost;
            }
            else
            {
                // Fallback to default mode if state not in DP table
                optimalModes.Add(OutputsMode.Discharge);
            }
        }
        
        return (totalCost, optimalModes);
    }

    private List<OutputsMode> GetPossibleModes()
    {
        return new List<OutputsMode>
        {
            OutputsMode.Discharge,
            OutputsMode.ChargeSolarOnly,
            OutputsMode.ChargeFromGridAndSolar
        };
    }

    private IEnumerable<Kwh> GetPossibleBatteryStates(int segmentIndex, List<TimeSegment> segments)
    {
        // Discretize battery states to reduce state space
        // Use 0.5 kWh increments for reasonable precision vs performance trade-off
        var increment = 0.5m.Kwh();
        var maxCapacity = _batteryPredictor.Capacity;
        
        var states = new List<Kwh>();
        for (var state = Kwh.Zero; state <= maxCapacity; state += increment)
        {
            states.Add(state);
        }
        
        // Add exact capacity value if not already included
        if (!states.Any(s => s == maxCapacity))
        {
            states.Add(maxCapacity);
        }
        
        return states;
    }

    private async Task<Gbp> CalculateCostForModeAndState(
        List<TimeSegment> baseSegments, 
        int segmentIndex, 
        Kwh batteryState, 
        OutputsMode mode,
        Dictionary<(int, Kwh), (Gbp, OutputsMode)> dp,
        LocalDate date)
    {
        // Create temporary segment for cost calculation
        var tempSegment = CloneSegment(baseSegments[segmentIndex]);
        tempSegment.Mode = mode;
        tempSegment.StartBatteryChargeKwh = batteryState;
        
        // Simulate this segment
        SimulateSingleSegment(tempSegment);
        
        // Calculate immediate cost
        var immediateCost = tempSegment.Cost();
        
        // If this is the last segment, return immediate cost
        if (segmentIndex == baseSegments.Count - 1)
        {
            return immediateCost;
        }
        
        // Look up future cost from DP table
        var nextBatteryState = RoundBatteryCharge(tempSegment.EndBatteryChargeKwh);
        var nextSegmentIndex = segmentIndex + 1;
        
        if (dp.ContainsKey((nextSegmentIndex, nextBatteryState)))
        {
            var futureCost = dp[(nextSegmentIndex, nextBatteryState)].Item1;
            return immediateCost + futureCost;
        }
        
        // If future state not in DP table, estimate with default mode
        return immediateCost + await EstimateFutureCost(baseSegments, nextSegmentIndex, nextBatteryState, date);
    }

    private async Task<Gbp> EstimateFutureCost(List<TimeSegment> baseSegments, int fromSegmentIndex, Kwh batteryState, LocalDate date)
    {
        // Simple heuristic: assume discharge mode for remaining segments
        var estimatedCost = Gbp.Zero;
        var currentBatteryCharge = batteryState;
        
        for (int i = fromSegmentIndex; i < baseSegments.Count; i++)
        {
            var tempSegment = CloneSegment(baseSegments[i]);
            tempSegment.Mode = OutputsMode.Discharge;
            tempSegment.StartBatteryChargeKwh = currentBatteryCharge;
            
            SimulateSingleSegment(tempSegment);
            estimatedCost += tempSegment.Cost();
            currentBatteryCharge = tempSegment.EndBatteryChargeKwh;
        }
        
        return estimatedCost;
    }

    private TimeSegment CloneSegment(TimeSegment original)
    {
        return new TimeSegment
        {
            HalfHourSegment = original.HalfHourSegment,
            ExpectedSolarGeneration = original.ExpectedSolarGeneration,
            GridPrice = original.GridPrice,
            ExpectedConsumption = original.ExpectedConsumption,
            StartBatteryChargeKwh = original.StartBatteryChargeKwh,
            EndBatteryChargeKwh = original.EndBatteryChargeKwh,
            Mode = original.Mode,
            WastedSolarGeneration = original.WastedSolarGeneration,
            ActualGridUsage = original.ActualGridUsage
        };
    }

    private void SimulateSingleSegment(TimeSegment segment)
    {
        // Extract simulation logic from HouseSimulator for single segment
        var solarCapacityForSegment = segment.ExpectedSolarGeneration;
        var gridCapacityForSegment = _batteryPredictor.GridChargePerSegment;
        var usage = segment.ExpectedConsumption;
        
        switch (segment.Mode)
        {
            case OutputsMode.ChargeSolarOnly:
                {
                    var newCharge = _batteryPredictor.PredictNewBatteryStateAfter30Minutes(segment.StartBatteryChargeKwh, solarCapacityForSegment);
                    segment.EndBatteryChargeKwh = Kwh.Min(newCharge, _batteryPredictor.Capacity);
                    
                    if (newCharge > _batteryPredictor.Capacity)
                    {
                        segment.WastedSolarGeneration = newCharge - _batteryPredictor.Capacity;
                    }

                    segment.ActualGridUsage = usage;
                    break;
                }
            case OutputsMode.ChargeFromGridAndSolar:
                {
                    var totalChargeCapacity = solarCapacityForSegment + gridCapacityForSegment;
                    var newCharge = _batteryPredictor.PredictNewBatteryStateAfter30Minutes(segment.StartBatteryChargeKwh, totalChargeCapacity);
                    segment.EndBatteryChargeKwh = Kwh.Min(newCharge, _batteryPredictor.Capacity);
                    
                    if (newCharge > _batteryPredictor.Capacity)
                    {
                        var excessCharge = newCharge - _batteryPredictor.Capacity;
                        segment.WastedSolarGeneration = excessCharge / 2;
                        segment.ActualGridUsage = gridCapacityForSegment;
                    }
                    break;
                }
            case OutputsMode.Discharge:
                {
                    var solarSurplus = segment.ExpectedSolarGeneration - usage;
                    if (solarSurplus < Kwh.Zero)
                    {
                        var solarDeficit = solarSurplus.AbsoluteValue();
                        var batteryDischarge = Kwh.Min(segment.StartBatteryChargeKwh, solarDeficit);
                        segment.EndBatteryChargeKwh = segment.StartBatteryChargeKwh - batteryDischarge;
                        segment.ActualGridUsage = solarDeficit - batteryDischarge;
                    }
                    else
                    {
                        var newCharge = _batteryPredictor.PredictNewBatteryStateAfter30Minutes(segment.StartBatteryChargeKwh, solarSurplus);
                        segment.EndBatteryChargeKwh = newCharge;
                    }
                    break;
                }
                            default:
                throw new InvalidOperationException($"Unexpected mode: {segment.Mode}");
        }
    }

    private Kwh RoundBatteryCharge(Kwh batteryCharge)
    {
        // Round to nearest 0.5 kWh for consistency with discretized states
        var roundedValue = Math.Round(batteryCharge.Value * 2, MidpointRounding.ToEven) / 2;
        return new Kwh((decimal)roundedValue);
    }

}