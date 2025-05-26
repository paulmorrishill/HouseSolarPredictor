using HouseSolarPredictor.Load;
using HouseSolarPredictor.Time;

namespace HouseSolarPredictor.Tests;

class TestBatteryPredictor : IBatteryPredictor
{
    public Kwh Capacity => new Kwh(10m);
    public Kwh GridChargePerSegment => new Kwh(2m);

    public Kwh PredictNewBatteryStateAfter30Minutes(Kwh startCapacity, Kwh availablePowerToCharge)
    {
        return startCapacity + availablePowerToCharge;
    }
}