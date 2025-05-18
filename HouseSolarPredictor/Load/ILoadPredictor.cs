using HouseSolarPredictor.Time;

namespace HouseSolarPredictor.Load;

public interface ILoadPredictor
{
    public Kwh PredictLoad(int dayOfYear, HalfHourSegment halfHourSegment);
}