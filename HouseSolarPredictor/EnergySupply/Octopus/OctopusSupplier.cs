using HouseSolarPredictor.Prediction;
using HouseSolarPredictor.Time;
using Newtonsoft.Json;
using NodaTime;

namespace HouseSolarPredictor.EnergySupply.Octopus;

public class OctopusSupplier: ISupplier
{
    private OctopusApiClient _apiClient;
    private Dictionary<string, EnergyPrice> _cache;
    private ILogger _logger;

    public OctopusSupplier(OctopusApiClient apiClient, ILogger logger)
    {
        _logger = logger;
        _apiClient = apiClient;
        _cache = new Dictionary<string, EnergyPrice>();
    }
    
    public async Task<ElectricityRate> GetPrice(LocalDate date, HalfHourSegment halfHourSegment)
    {
         var cacheKey = new CacheKey(date, halfHourSegment);
         if(!_cache.ContainsKey(cacheKey.ToString()))
         {
             var ukTimeZone = DateTimeZoneProviders.Tzdb["Europe/London"];
             var start = date.At(new LocalTime()).InZoneStrictly(ukTimeZone);
             var end = date.PlusDays(2).At(new LocalTime()).InZoneStrictly(ukTimeZone);
             var prices = await _apiClient.GetElectricityPricesAsync(start.ToDateTimeUtc(), end.ToDateTimeUtc());

             foreach (var priceAtDate in prices)
             {
                 var thisPriceCacheKey = LocalDate.FromDateTime(priceAtDate.ValidFrom);
                 var thisPriceSegment = HalfHourSegment.FromDateTime(priceAtDate.ValidFrom);
                 var key = new CacheKey(thisPriceCacheKey, thisPriceSegment);
                 _cache[key.ToString()] = priceAtDate;
             }
         }

         var thisSegmentCacheKey = new CacheKey(date, halfHourSegment);
            if (!_cache.ContainsKey(thisSegmentCacheKey.ToString()))
            {
                var priceFromAverages = PriceCurve.GetPrice(date, halfHourSegment);
                _logger.Log($"\u26a0\ufe0f No cached price found for {thisSegmentCacheKey}. Using average price: {priceFromAverages}");
                return new ElectricityRate(new Gbp(priceFromAverages));
            }
         var pricePerKwh = _cache[thisSegmentCacheKey.ToString()].PricePerKwh;
         return new ElectricityRate(pricePerKwh);
    }
    
    public static class PriceCurve
    {
        private static Dictionary<string, List<Segment>> _priceData;

        static PriceCurve()
        {
            var jsonPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "energysupply/octopus/average_prices.json");
            var jsonContent = File.ReadAllText(jsonPath);
            _priceData = JsonConvert.DeserializeObject<Dictionary<string, List<Segment>>>(jsonContent);
        }

        public static decimal GetPrice(LocalDate dayOfYear, HalfHourSegment segment)
        {
            if (!_priceData.TryGetValue(dayOfYear.Day.ToString(), out var segments))
                throw new ArgumentOutOfRangeException(nameof(dayOfYear), "Invalid day of year");

            var segmentIndex = segment.HourStart * 2 + (segment.MinuteStart >= 30 ? 1 : 0);
            if (segmentIndex < 0 || segmentIndex >= segments.Count)
                throw new ArgumentOutOfRangeException(nameof(segment.MinuteStart), "Invalid time segment");

            return segments[segmentIndex].Cost / 100m; // Convert pence to pounds
        }

        private class Segment
        {
            [JsonProperty("start_hour")]
            public int StartHour { get; set; }

            [JsonProperty("start_minute")]
            public int StartMinute { get; set; }

            [JsonProperty("cost")]
            public decimal Cost { get; set; }
        }
    }
}