using System.Text.Json.Serialization;

namespace HouseSolarPredictor.EnergySupply.Octopus;

public class OctopusConsumptionResponse
{
    [JsonPropertyName("results")]
    public List<Consumption> Results { get; set; } = new();

    [JsonPropertyName("next")]
    public string Next { get; set; }

    public class Consumption
    {
        [JsonPropertyName("interval_start")]
        public string IntervalStart { get; set; }

        [JsonPropertyName("interval_end")]
        public string IntervalEnd { get; set; }

        [JsonPropertyName("consumption")]
        public float ConsumptionValue { get; set; }
    }
}