using System.Text.Json.Serialization;

namespace HouseSolarPredictor.EnergySupply.Octopus;

public class OctopusPricesResponse
{
    [JsonPropertyName("results")]
    public List<Price> Results { get; set; } = new();

    [JsonPropertyName("next")]
    public string Next { get; set; }

    public class Price
    {
        [JsonPropertyName("valid_from")]
        public string ValidFrom { get; set; }

        [JsonPropertyName("valid_to")]
        public string ValidTo { get; set; }

        [JsonPropertyName("value_inc_vat")]
        public decimal ValueIncVat { get; set; }
    }
}