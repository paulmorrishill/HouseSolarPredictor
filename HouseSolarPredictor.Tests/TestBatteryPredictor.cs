using HouseSolarPredictor.Load;
using HouseSolarPredictor.Time;

namespace HouseSolarPredictor.Tests;

class TestBatteryPredictor : IBatteryPredictor
{
    public Kwh Capacity => new Kwh(10m);
    public Kwh GridChargePerSegment => new Kwh(2m);
    public (Kwh NewCharge, Kwh Wastage) PredictNewBatteryStateAfter30Minutes(Kwh startCapacity, Kwh availablePowerToCharge)
    {
        var newCharge = startCapacity + availablePowerToCharge;
        if (newCharge > Capacity)
        {
            return (Capacity, newCharge - Capacity);
        }
        return (newCharge, Kwh.Zero);
    }
}