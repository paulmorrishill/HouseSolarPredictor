using HouseSolarPredictor.Time;

namespace HouseSolarPredictor.Load;

public interface ISolarPredictor
{
    public Kwh PredictSolarEnergy(int dayOfYear, HalfHourSegment halfHourSegment);
}