using HouseSolarPredictor.Time;

namespace HouseSolarPredictor.Load;

public interface ISolarPredictor
{
    public Kwh PredictSolarEnergy(int dayOfYear, HalfHourSegment halfHourSegment);
}

public interface IBatteryPredictor
{
    public Kwh PredictNewBatteryState(Kwh startCapacity, Kwh inputCharge);
}

public class LifePo4BatteryPredictor : IBatteryPredictor
{
    public Kwh PredictNewBatteryState(Kwh startCapacity, Kwh inputCharge)
    {
        // Assuming a simple model where the battery capacity is increased by the input charge
        return startCapacity + inputCharge * 0.9m; // 90% efficiency
    }
}