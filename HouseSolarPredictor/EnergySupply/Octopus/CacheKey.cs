using HouseSolarPredictor.Time;
using NodaTime;

namespace HouseSolarPredictor.EnergySupply.Octopus;

public struct CacheKey
{
    public LocalDate Date;
    public HalfHourSegment HalfHourSegment;

    public CacheKey(LocalDate date, HalfHourSegment halfHourSegment)
    {
        HalfHourSegment = halfHourSegment;
        Date = date;
    }
    
    // tostring
    public override string ToString()
    {
        return $"{Date:yyyy-MM-dd} {HalfHourSegment}";
    }
}