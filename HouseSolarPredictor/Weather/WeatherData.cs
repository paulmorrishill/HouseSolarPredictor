namespace HouseSolarPredictor.Weather;

public class WeatherData
{
    public float Temperature { get; set; }
    public float CloudCover { get; set; }
    public float CloudCoverLow { get; set; }
    public float CloudCoverMid { get; set; }
    public float CloudCoverHigh { get; set; }
    public float WindSpeed { get; set; }
    public float ApparentTemperature { get; set; }
    public float Precipitation { get; set; }
    public float DiffuseRadiation { get; set; }
    public float DirectRadiation { get; set; }
    public float TerrestrialRadiation { get; set; }
    public float ShortwaveRadiation { get; set; }
    public float GlobalTiltedIrradiance { get; set; }

    // Helper method to convert to dictionary for backward compatibility
    public Dictionary<string, float> ToDictionary()
    {
        var dict = new Dictionary<string, float>
        {
            { "temperature_2m (°C)", Temperature },
            { "cloud_cover (%)", CloudCover },
            { "cloud_cover_low (%)", CloudCoverLow },
            { "cloud_cover_mid (%)", CloudCoverMid },
            { "cloud_cover_high (%)", CloudCoverHigh },
            { "wind_speed_10m (km/h)", WindSpeed },
            { "apparent_temperature (°C)", ApparentTemperature },
            { "precipitation (mm)", Precipitation },
            { "diffuse_radiation (W/m²)", DiffuseRadiation },
            { "direct_radiation (W/m²)", DirectRadiation },
            { "terrestrial_radiation (W/m²)", TerrestrialRadiation },
            { "shortwave_radiation (W/m²)", ShortwaveRadiation },
            { "global_tilted_irradiance (W/m²)", GlobalTiltedIrradiance }
        };
        return dict;
    }
}