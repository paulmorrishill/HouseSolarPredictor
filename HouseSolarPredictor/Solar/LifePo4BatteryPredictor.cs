using HouseSolarPredictor.Time;

namespace HouseSolarPredictor.Load;

public class LifePo4BatteryPredictor : IBatteryPredictor
{
    public LifePo4BatteryPredictor(Kwh capacity, Kwh maxChargePerSegment)
    {
        Capacity = capacity;
        GridChargePerSegment = maxChargePerSegment;
    }

    public Kwh Capacity { get; }
    public Kwh GridChargePerSegment { get; }
    
    public (Kwh NewCharge, Kwh Wastage) PredictNewBatteryStateAfter30Minutes(Kwh startCapacity, Kwh availablePowerToCharge)
    {
        var newCharge = startCapacity + availablePowerToCharge;
        if (newCharge > Capacity)
        {
            var wastage = newCharge - Capacity;
            return (Capacity, wastage);
        }
        return (newCharge, Kwh.Zero);
    }
}
