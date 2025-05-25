using HouseSolarPredictor.Time;

namespace HouseSolarPredictor.Load;

public interface ISolarPredictor
{
    public Kwh PredictSolarEnergy(int dayOfYear, HalfHourSegment halfHourSegment);
}

public interface IBatteryPredictor
{
    public Kwh Capacity { get; }
    public Kwh GridChargePerSegment { get; }
    public Kwh PredictNewBatteryStateAfter30Minutes(Kwh startCapacity, Kwh availablePowerToCharge);
}

public class LifePo4BatteryPredictor : IBatteryPredictor
{
    public LifePo4BatteryPredictor(Kwh capacity, Kwh maxChargePerSegment)
    { 
        Capacity = capacity;
        GridChargePerSegment = maxChargePerSegment;
    }

    public Kwh Capacity { get; }
    public Kwh GridChargePerSegment { get; }

    public Kwh PredictNewBatteryStateAfter30Minutes(Kwh startCapacity, Kwh availablePowerToCharge)
    {
        // Assuming a simple model where the battery capacity is increased by the input charge
        return startCapacity + availablePowerToCharge * 0.9m; // 90% efficiency
    }
}