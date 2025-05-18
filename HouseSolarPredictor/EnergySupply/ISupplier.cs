using HouseSolarPredictor.Time;
using NodaTime;

namespace HouseSolarPredictor.EnergySupply;

public interface ISupplier
{
    public Task<ElectricityRate> GetPrice(LocalDate date, HalfHourSegment halfHourSegment);
}