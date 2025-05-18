using HouseSolarPredictor.Time;
using NodaTime;

namespace HouseSolarPredictor.EnergySupply.Octopus;

public class OctopusSupplier: ISupplier
{
    private OctopusApiClient _apiClient;
    private Dictionary<CacheKey, EnergyPrice> _cache;

    public OctopusSupplier(OctopusApiClient apiClient)
    {
        _apiClient = apiClient;
        _cache = new Dictionary<CacheKey, EnergyPrice>();
    }
    
    public async Task<ElectricityRate> GetPrice(LocalDate date, HalfHourSegment halfHourSegment)
    {
         var cacheKey = new CacheKey(date, halfHourSegment);
         if(!_cache.ContainsKey(cacheKey))
         {
             var ukTimeZone = DateTimeZoneProviders.Tzdb["Europe/London"];
             var start = date.At(new LocalTime()).InZoneStrictly(ukTimeZone);
             var end = date.PlusDays(1).At(new LocalTime()).InZoneStrictly(ukTimeZone);
             var prices = await _apiClient.GetElectricityPricesAsync(start.ToDateTimeUtc(), end.ToDateTimeUtc());

             foreach (var priceAtDate in prices)
             {
                 var thisPriceSegment = HalfHourSegment.FromDateTime(priceAtDate.ValidFrom);
                 _cache[new CacheKey(date, thisPriceSegment)] = priceAtDate;
             }
         }

         var pricePerKwh = _cache[cacheKey].PricePerKwh;
         return new ElectricityRate(pricePerKwh);
    }
}

public record CacheKey
{
    public CacheKey(LocalDate date, HalfHourSegment halfHourSegment)
    {
    }
}