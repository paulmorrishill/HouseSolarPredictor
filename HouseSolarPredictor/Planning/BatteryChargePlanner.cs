using System.Collections.ObjectModel;
using HouseSolarPredictor.EnergySupply;
using HouseSolarPredictor.Load;
using HouseSolarPredictor.Time;
using NodaTime;

namespace HouseSolarPredictor.Prediction;

public class BatteryChargePlanner
{
    private ISolarPredictor _solarPredictor;
    private ILoadPredictor _loadPredictor;
    private ISupplier _supplier;
    private IBatteryPredictor _BatteryPredictor;

    public BatteryChargePlanner(ISolarPredictor solarPredictor, ILoadPredictor loadPredictor, ISupplier supplier,
        IBatteryPredictor batteryPredictor)
    {
        _BatteryPredictor = batteryPredictor;
        _supplier = supplier;
        _loadPredictor = loadPredictor;
        _solarPredictor = solarPredictor;
    }

    public async Task<List<TimeSegment>> CreateChargePlan(LocalDate date)
    {
        // find cheapest slots
        // charge in those slots
        // discharge in others
        var segments = HalfHourSegments.AllSegments;
        var workingSegments = new List<TimeSegment>();
        await InitialiseDefaultSegmentsLoadFirst(date, segments, workingSegments);

        for(var i = 0; i < workingSegments.Count; i++)
        {
            await FlipOneSegmentToChargeFromGrid(workingSegments);
            // calculate losses and wasted solar generation
            RunDaySimulation(workingSegments);
        }
        
        return workingSegments;
    }

    public async Task FlipOneSegmentToChargeFromGrid(List<TimeSegment> workingSegments)
    {
        // find lowest price segment that is not already charging
        var lowestPriceSegment = workingSegments
            .Where(s => s.Mode != OutputsMode.ChargeFromGridAndSolar).MinBy(s => s.GridPrice);

        if (lowestPriceSegment == null)
        {
            throw new Exception("No segments available to flip to charge from grid.");
        }
        
        lowestPriceSegment.Mode = OutputsMode.ChargeFromGridAndSolar;
    }

    private void RunDaySimulation(List<TimeSegment> workingSegments)
    {
        Kwh currentBatteryCharge = Kwh.Zero;

        foreach (var segment in workingSegments)
        {
            segment.StartBatteryChargeKwh = currentBatteryCharge;
            SimulateBatteryChargingAndWastage(segment);
        }
    }

    private void SimulateBatteryChargingAndWastage(TimeSegment segment)
    {
        var solarCapacityForSegment = segment.SolarGeneration;
        var gridCapacityForSegment = _BatteryPredictor.GridChargePerSegment;
        var usage = segment.EstimatedConsumption;
        
        if (segment.Mode == OutputsMode.ChargeSolarOnly)
        {
            var newCharge = _BatteryPredictor.PredictNewBatteryStateAfter30Minutes(segment.StartBatteryChargeKwh, solarCapacityForSegment);
            // If the solar generation exceeds the battery capacity, we waste the excess
            if (newCharge > _BatteryPredictor.Capacity)
            {
                segment.WastedSolarGeneration = Kwh.Min(Kwh.Zero, newCharge - _BatteryPredictor.Capacity);
            }
        }
        
        if (segment.Mode == OutputsMode.ChargeFromGridAndSolar)
        {
            var totalChargeCapacity = solarCapacityForSegment + gridCapacityForSegment;
            var newCharge = _BatteryPredictor.PredictNewBatteryStateAfter30Minutes(segment.StartBatteryChargeKwh, totalChargeCapacity);
            // If the total charge exceeds the battery capacity assume 50% of solar is wasted
            // as we don't know how much solar went to battery vs how much from grid
            if (newCharge > _BatteryPredictor.Capacity)
            {
                segment.WastedSolarGeneration = Kwh.Min(Kwh.Zero, newCharge - _BatteryPredictor.Capacity);
                if(segment.WastedSolarGeneration > Kwh.Zero)
                {
                    segment.WastedSolarGeneration /= 2; // Assume half of the wasted solar was used to charge the battery
                }
            }
        }

        if (segment.Mode == OutputsMode.Discharge)
        {
            var solarSurplus = segment.SolarGeneration - usage;
            if (solarSurplus < Kwh.Zero)
            {
                var batteryDischarge = Kwh.Max(segment.StartBatteryChargeKwh, solarSurplus.AbsoluteValue());
                segment.EndBatteryChargeKwh = Kwh.Max(Kwh.Zero, segment.StartBatteryChargeKwh - batteryDischarge);
            }
            else
            {
                // If solar generation is more than usage, we can charge the battery
                var newCharge = _BatteryPredictor.PredictNewBatteryStateAfter30Minutes(segment.StartBatteryChargeKwh, solarSurplus);
                segment.EndBatteryChargeKwh = newCharge;
            }
        }
        
        throw new InvalidOperationException($"Unexpected mode: {segment.Mode}");
    }

    private async Task InitialiseDefaultSegmentsLoadFirst(LocalDate date, ReadOnlyCollection<HalfHourSegment> segments, List<TimeSegment> workingSegments)
    {
        foreach (var segment in segments)
        {
            var solarGeneration = _solarPredictor.PredictSolarEnergy(date.DayOfYear, segment);
            var gridPrice = await _supplier.GetPrice(date, segment);
            var estimatedConsumption = _loadPredictor.PredictLoad(date.DayOfYear, segment);

            var timeSegment = new TimeSegment
            {
                HalfHourSegment = segment,
                SolarGeneration = solarGeneration,
                GridPrice = gridPrice,
                EstimatedConsumption = estimatedConsumption,
                StartBatteryChargeKwh = Kwh.Zero,
                EndBatteryChargeKwh = Kwh.Zero,
                Mode = OutputsMode.Discharge,
                WastedSolarGeneration = Kwh.Zero
            };

            workingSegments.Add(timeSegment);
        }
    }
}