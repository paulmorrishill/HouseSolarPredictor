using HouseSolarPredictor.Load;
using HouseSolarPredictor.Time;
using NodaTime;

namespace HouseSolarPredictor.Prediction;

public class HouseSimulator : IHouseSimulator
{
    private readonly IBatteryPredictor _batteryPredictor;

    public HouseSimulator(IBatteryPredictor batteryPredictor)
    {
        _batteryPredictor = batteryPredictor;
    }

    public async Task RunSimulation(List<TimeSegment> segments, LocalDate date)
    {
        var workingSegments = segments;
        Kwh currentBatteryCharge = workingSegments.First().StartBatteryChargeKwh;

        foreach (var segment in workingSegments)
        {
            segment.StartBatteryChargeKwh = currentBatteryCharge;
            SimulateBatteryChargingAndWastage(segment);
            currentBatteryCharge = segment.EndBatteryChargeKwh;
        }
    }

    private void SimulateBatteryChargingAndWastage(TimeSegment segment)
    {
        var solarCapacityForSegment = segment.ExpectedSolarGeneration;
        var gridCapacityForSegment = _batteryPredictor.GridChargePerSegment;
        var load = segment.ExpectedConsumption;
        var capacityRemaining = _batteryPredictor.Capacity - segment.StartBatteryChargeKwh;
        
        switch (segment.Mode)
        {
            case OutputsMode.ChargeSolarOnly:
                {
                    var newCharge = _batteryPredictor.PredictNewBatteryStateAfter30Minutes(segment.StartBatteryChargeKwh, solarCapacityForSegment);
                    segment.EndBatteryChargeKwh = Kwh.Min(newCharge, _batteryPredictor.Capacity);
                    
                    // If the solar generation exceeds the battery capacity, we waste the excess
                    if (newCharge > _batteryPredictor.Capacity)
                    {
                        segment.WastedSolarGeneration = newCharge - _batteryPredictor.Capacity;
                    }

                    segment.ActualGridUsage = load;
                    break;
                }
            case OutputsMode.ChargeFromGridAndSolar:
                {
                    var totalChargeCapacity = solarCapacityForSegment + gridCapacityForSegment;
                    var newCharge = _batteryPredictor.PredictNewBatteryStateAfter30Minutes(segment.StartBatteryChargeKwh, totalChargeCapacity);
                    segment.EndBatteryChargeKwh = Kwh.Min(newCharge, _batteryPredictor.Capacity);
                    
                    // If the total charge exceeds the battery capacity assume 50% of solar is wasted
                    // as we don't know how much solar went to battery vs how much from grid
                    if (newCharge > _batteryPredictor.Capacity)
                    {
                        var batteryLeftToCharge = _batteryPredictor.Capacity - segment.StartBatteryChargeKwh;
                        var halfCharge = batteryLeftToCharge / 2;

                        var amountChargedFromSolar = Kwh.Min(halfCharge, solarCapacityForSegment);
                        batteryLeftToCharge -= amountChargedFromSolar;
                        
                        var amountChargedFromGrid = Kwh.Min(batteryLeftToCharge, gridCapacityForSegment);
                        segment.WastedSolarGeneration = solarCapacityForSegment - amountChargedFromSolar;
                        segment.ActualGridUsage = amountChargedFromGrid + load;
                        break;
                    }

                    segment.ActualGridUsage = gridCapacityForSegment + load; // All grid charge is used
                    break;
                }
            case OutputsMode.Discharge:
                {
                    var solarSurplus = segment.ExpectedSolarGeneration - load;
                    if (solarSurplus < Kwh.Zero)
                    {
                        var solarDeficit = solarSurplus.AbsoluteValue();
                        var batteryDischarge = Kwh.Min(segment.StartBatteryChargeKwh, solarDeficit);
                        segment.EndBatteryChargeKwh = segment.StartBatteryChargeKwh - batteryDischarge;
                        segment.ActualGridUsage = solarDeficit - batteryDischarge;
                        break;
                    }
                    
                    var newCharge = _batteryPredictor.PredictNewBatteryStateAfter30Minutes(segment.StartBatteryChargeKwh, solarSurplus);
                    segment.EndBatteryChargeKwh = newCharge;
                    break;
                }
            default:
                throw new InvalidOperationException($"Unexpected mode: {segment.Mode}");
        }
    }
}