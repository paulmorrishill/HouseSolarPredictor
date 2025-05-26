using System.Collections.ObjectModel;
using HouseSolarPredictor.EnergySupply;
using HouseSolarPredictor.Load;
using HouseSolarPredictor.Time;
using NodaTime;

namespace HouseSolarPredictor.Prediction;

public class ChargePlanner
{
    private readonly ISolarPredictor _solarPredictor;
    private readonly ILoadPredictor _loadPredictor;
    private readonly ISupplier _supplier;
    private IBatteryPredictor _batteryPredictor;
    private IHouseSimulator _houseSimulator;
    public readonly IPlanOptimiser Optimiser;

    public ChargePlanner(ISolarPredictor solarPredictor, ILoadPredictor loadPredictor, 
        ISupplier supplier, IBatteryPredictor batteryPredictor, IHouseSimulator houseSimulator, 
        IPlanOptimiser optimiser)
    {
        Optimiser = optimiser;
        _houseSimulator = houseSimulator;
        _batteryPredictor = batteryPredictor;
        _supplier = supplier;
        _loadPredictor = loadPredictor;
        _solarPredictor = solarPredictor;
    }
    
    public async Task<List<TimeSegment>> CreateChargePlan(LocalDate date, Kwh startCharge)
    {
        var segments = HalfHourSegments.AllSegments;
        var baseSegments = new List<TimeSegment>();
        await InitialiseDefaultSegmentsLoadFirst(date, segments, baseSegments);
        // Set initial battery charge for the first segment
        baseSegments.First().StartBatteryChargeKwh = startCharge;
        await Optimiser.CreateChargePlan(baseSegments, date);
        
        await _houseSimulator.RunSimulation(baseSegments, date);
        return baseSegments;
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