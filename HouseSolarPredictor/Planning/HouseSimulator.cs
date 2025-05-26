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

    public void SimulateBatteryChargingAndWastage(TimeSegment segment)
    {
        var solarCapacityForSegment = segment.ExpectedSolarGeneration;
        var gridCapacityForSegment = _batteryPredictor.GridChargePerSegment;
        var load = segment.ExpectedConsumption;
        
        switch (segment.Mode)
        {
            case OutputsMode.ChargeSolarOnly:
                {
                    var (newCharge, wastage) = _batteryPredictor.PredictNewBatteryStateAfter30Minutes(segment.StartBatteryChargeKwh, solarCapacityForSegment);
                    segment.EndBatteryChargeKwh = Kwh.Min(newCharge, _batteryPredictor.Capacity);
                    segment.WastedSolarGeneration = wastage;
                    segment.ActualGridUsage = load;
                    break;
                }
            case OutputsMode.ChargeFromGridAndSolar:
                {
                    var totalChargeCapacity = solarCapacityForSegment + gridCapacityForSegment;
                    var (newCharge, wastage) = _batteryPredictor.PredictNewBatteryStateAfter30Minutes(segment.StartBatteryChargeKwh, totalChargeCapacity);
                    segment.EndBatteryChargeKwh = Kwh.Min(newCharge, _batteryPredictor.Capacity);

                    if (wastage > Kwh.Zero)
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

                    segment.ActualGridUsage = gridCapacityForSegment + load;
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

                    var (newCharge, wastage) = _batteryPredictor.PredictNewBatteryStateAfter30Minutes(segment.StartBatteryChargeKwh, solarSurplus);
                    
                    segment.EndBatteryChargeKwh = newCharge;
                    segment.WastedSolarGeneration = wastage;
                    break;
                }
            default:
                throw new InvalidOperationException($"Unexpected mode: {segment.Mode}");
        }
    }
}