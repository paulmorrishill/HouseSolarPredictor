using HouseSolarPredictor.Time;
using NodaTime;

namespace HouseSolarPredictor.EnergySupply.Octopus;

public record CacheKey
{
    public CacheKey(LocalDate date, HalfHourSegment halfHourSegment)
    {
    }
}