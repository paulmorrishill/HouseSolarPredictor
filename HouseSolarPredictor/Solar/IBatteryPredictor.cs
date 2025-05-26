using HouseSolarPredictor.Time;

namespace HouseSolarPredictor.Load;

public interface IBatteryPredictor
{
    public Kwh Capacity { get; }
    public Kwh GridChargePerSegment { get; }
    public Kwh PredictNewBatteryStateAfter30Minutes(Kwh startCapacity, Kwh availablePowerToCharge);
}