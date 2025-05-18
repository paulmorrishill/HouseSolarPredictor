using HouseSolarPredictor.Time;

namespace HouseSolarPredictor.Prediction;

public class BatteryChargingOptimizer
{
    // Battery parameters
    private readonly float _batteryCapacityKwh;
    private readonly float _maxChargingRateKw;
    private readonly float _chargingEfficiency;

    // Constructor
    public BatteryChargingOptimizer(
        float batteryCapacityKwh,
        float maxChargingRateKw,
        float chargingEfficiency)
    {
        _batteryCapacityKwh = batteryCapacityKwh;
        _maxChargingRateKw = maxChargingRateKw;
        _chargingEfficiency = chargingEfficiency;
    }

    public List<TimeSegment> OptimizeChargingPlan(
        List<TimeSegment> timeSegments)
    {
        var segments = timeSegments.Select(s => new TimeSegment
        {
            StartTime = s.StartTime,
            EndTime = s.EndTime,
            SolarGeneration = s.SolarGeneration,
            EnergyPrice = s.EnergyPrice,
            EstimatedConsumption = s.EstimatedConsumption,
            Mode = OutputsMode.LoadFirst,
            ChargingAmount = Kwh.Zero,
            PredictedState = s.PredictedState
        }).ToList();

        return segments;
    }
}