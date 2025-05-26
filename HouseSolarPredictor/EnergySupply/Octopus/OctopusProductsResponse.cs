using System.Text.Json.Serialization;

namespace HouseSolarPredictor.EnergySupply.Octopus;

public class OctopusProductsResponse
{
    [JsonPropertyName("results")]
    public List<Product> Results { get; set; } = new();

    [JsonPropertyName("next")]
    public string Next { get; set; }

    public class Product
    {
        [JsonPropertyName("code")]
        public string Code { get; set; }

        [JsonPropertyName("display_name")]
        public string DisplayName { get; set; }

        [JsonPropertyName("description")]
        public string Description { get; set; } = "";
    }
}