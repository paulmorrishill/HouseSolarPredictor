using System.Text.Json.Serialization;

namespace HouseSolarPredictor.EnergySupply.Octopus;

public class OctopusRegionsResponse
{
    [JsonPropertyName("results")]
    public List<Region> Results { get; set; } = new();

    [JsonPropertyName("next")]
    public string Next { get; set; }

    public class Region
    {
        [JsonPropertyName("group_id")]
        public string GroupId { get; set; }

        [JsonPropertyName("name")]
        public string Name { get; set; }
    }
}