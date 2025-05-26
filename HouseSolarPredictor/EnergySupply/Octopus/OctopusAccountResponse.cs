using System.Text.Json.Serialization;

namespace HouseSolarPredictor.EnergySupply.Octopus;

public class OctopusAccountResponse
{
    [JsonPropertyName("properties")]
    public List<Property> Properties { get; set; } = new();

    public class Property
    {
        [JsonPropertyName("electricity_meter_points")]
        public List<ElectricityMeterPoint> ElectricityMeterPoints { get; set; } = new();
    }

    public class ElectricityMeterPoint
    {
        [JsonPropertyName("mpan")]
        public string Mpan { get; set; }

        [JsonPropertyName("meters")]
        public List<Meter> Meters { get; set; } = new();

        [JsonPropertyName("agreements")]
        public List<Agreement> Agreements { get; set; } = new();
    }

    public class Meter
    {
        [JsonPropertyName("serial_number")]
        public string SerialNumber { get; set; }
    }

    public class Agreement
    {
        [JsonPropertyName("tariff_code")]
        public string TariffCode { get; set; }

        [JsonPropertyName("valid_from")]
        public string ValidFrom { get; set; }

        [JsonPropertyName("valid_to")]
        public string ValidTo { get; set; }
    }
}