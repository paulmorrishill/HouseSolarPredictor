using System.Text.Json;

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

public class DayInfo
{
    public float DaylightDuration { get; set; }
    public float SunshineDuration { get; set; }
    public int SunriseHour { get; set; }
    public int SunriseMinute { get; set; }
    public int SunsetHour { get; set; }
    public int SunsetMinute { get; set; }

    // Helper method to convert to dictionary for backward compatibility
    public Dictionary<string, float> ToDictionary()
    {
        var dict = new Dictionary<string, float>
        {
            { "daylight_duration (s)", DaylightDuration },
            { "sunshine_duration (s)", SunshineDuration },
            { "sunrise_hour", SunriseHour },
            { "sunrise_minute", SunriseMinute },
            { "sunset_hour", SunsetHour },
            { "sunset_minute", SunsetMinute }
        };
        return dict;
    }
}

public class OpenMeteoClient
{
    private readonly HttpClient _httpClient;
        
    // Winsford, England coordinates
    private const float LATITUDE = 53.19f;
    private const float LONGITUDE = -2.53f;
        
    private const string API_BASE_URL = "https://api.open-meteo.com/v1/";

    public OpenMeteoClient()
    {
        _httpClient = new HttpClient();
    }

    public async Task<WeatherData> GetWeatherDataAsync(DateTime timestamp)
    {
        // Format the timestamp for the API query
        string formattedDate = timestamp.ToString("yyyy-MM-dd");
            
        // Construct the API URL for forecast or historical data based on date
        string apiUrl;
        if (timestamp.Date == DateTime.Today)
        {
            // For current day, use forecast API
            apiUrl = $"{API_BASE_URL}forecast?latitude={LATITUDE}&longitude={LONGITUDE}&hourly=temperature_2m,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,wind_speed_10m,apparent_temperature,precipitation,diffuse_radiation,direct_radiation,terrestrial_radiation,shortwave_radiation&forecast_days=1&timezone=auto";
        }
        else if (timestamp < DateTime.Today)
        {
            // For past days, use historical data API
            apiUrl = $"{API_BASE_URL}archive?latitude={LATITUDE}&longitude={LONGITUDE}&start_date={formattedDate}&end_date={formattedDate}&hourly=temperature_2m,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,wind_speed_10m,apparent_temperature,precipitation,diffuse_radiation,direct_radiation,terrestrial_radiation,shortwave_radiation&timezone=auto";
        }
        else
        {
            // For future dates
            int forecastDays = (timestamp.Date - DateTime.Today).Days + 1;
            forecastDays = Math.Min(forecastDays, 16); // API limit is 16 days
            apiUrl = $"{API_BASE_URL}forecast?latitude={LATITUDE}&longitude={LONGITUDE}&hourly=temperature_2m,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,wind_speed_10m,apparent_temperature,precipitation,diffuse_radiation,direct_radiation,terrestrial_radiation,shortwave_radiation&forecast_days={forecastDays}&timezone=auto";
        }

        try
        {
            // Make the API request
            HttpResponseMessage response = await _httpClient.GetAsync(apiUrl);
            response.EnsureSuccessStatusCode();
                
            string responseBody = await response.Content.ReadAsStringAsync();
                
            // Parse the JSON response
            using JsonDocument doc = JsonDocument.Parse(responseBody);
            JsonElement root = doc.RootElement;
                
            // Get hourly data
            JsonElement hourlyData = root.GetProperty("hourly");
                
            // Get the timestamps
            string[] timestamps = hourlyData.GetProperty("time").EnumerateArray()
                .Select(e => e.GetString())
                .ToArray();
                
            // Find the index of the closest timestamp
            int closestIndex = -1;
            TimeSpan smallestDifference = TimeSpan.MaxValue;
                
            for (int i = 0; i < timestamps.Length; i++)
            {
                if (DateTime.TryParse(timestamps[i], out DateTime apiTimestamp))
                {
                    TimeSpan difference = timestamp - apiTimestamp;
                    difference = difference.Duration(); // Get absolute value
                        
                    if (difference < smallestDifference)
                    {
                        smallestDifference = difference;
                        closestIndex = i;
                    }
                }
            }
                
            if (closestIndex == -1)
            {
                throw new Exception("Could not find matching timestamp in API response");
            }
                
            // Create a new WeatherData object
            var weatherData = new WeatherData();
                
            // Extract values and set properties
            weatherData.Temperature = GetWeatherValue(hourlyData, "temperature_2m", closestIndex);
            weatherData.CloudCover = GetWeatherValue(hourlyData, "cloud_cover", closestIndex);
            weatherData.CloudCoverLow = GetWeatherValue(hourlyData, "cloud_cover_low", closestIndex);
            weatherData.CloudCoverMid = GetWeatherValue(hourlyData, "cloud_cover_mid", closestIndex);
            weatherData.CloudCoverHigh = GetWeatherValue(hourlyData, "cloud_cover_high", closestIndex);
            weatherData.WindSpeed = GetWeatherValue(hourlyData, "wind_speed_10m", closestIndex);
            weatherData.ApparentTemperature = GetWeatherValue(hourlyData, "apparent_temperature", closestIndex);
            weatherData.Precipitation = GetWeatherValue(hourlyData, "precipitation", closestIndex);
            weatherData.DiffuseRadiation = GetWeatherValue(hourlyData, "diffuse_radiation", closestIndex);
            weatherData.DirectRadiation = GetWeatherValue(hourlyData, "direct_radiation", closestIndex);
            weatherData.TerrestrialRadiation = GetWeatherValue(hourlyData, "terrestrial_radiation", closestIndex);
            weatherData.ShortwaveRadiation = GetWeatherValue(hourlyData, "shortwave_radiation", closestIndex);
                
            // Calculate global_tilted_irradiance as the sum of diffuse and direct radiation
            weatherData.GlobalTiltedIrradiance = weatherData.DiffuseRadiation + weatherData.DirectRadiation;
                
            return weatherData;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error fetching weather data: {ex.Message}");
            throw;
        }
    }
        
    private float GetWeatherValue(JsonElement hourlyData, string apiField, int index)
    {
        try
        {
            JsonElement values = hourlyData.GetProperty(apiField);
            return values.EnumerateArray().ElementAt(index).GetSingle();
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Warning: Could not extract {apiField} from API response: {ex.Message}");
            return 0; // Default value
        }
    }
        
    public async Task<DayInfo> GetDayInfoAsync(DateTime date)
    {
        // Construct API URL to get sun times
        string formattedDate = date.ToString("yyyy-MM-dd");
        string apiUrl = $"{API_BASE_URL}forecast?latitude={LATITUDE}&longitude={LONGITUDE}&daily=sunrise,sunset,daylight_duration,sunshine_duration&timezone=auto&start_date={formattedDate}&end_date={formattedDate}";
            
        try
        {
            // Make the API request
            HttpResponseMessage response = await _httpClient.GetAsync(apiUrl);
            response.EnsureSuccessStatusCode();
                
            string responseBody = await response.Content.ReadAsStringAsync();
                
            // Parse the JSON response
            using JsonDocument doc = JsonDocument.Parse(responseBody);
            JsonElement root = doc.RootElement;
                
            // Get daily data
            JsonElement daily = root.GetProperty("daily");
                
            var dayInfo = new DayInfo();
                
            // Extract daylight duration in seconds
            if (daily.TryGetProperty("daylight_duration", out JsonElement daylightDuration))
            {
                dayInfo.DaylightDuration = daylightDuration.EnumerateArray().First().GetSingle();
            }
                
            // Extract sunshine duration in seconds
            if (daily.TryGetProperty("sunshine_duration", out JsonElement sunshineDuration))
            {
                dayInfo.SunshineDuration = sunshineDuration.EnumerateArray().First().GetSingle();
            }
                
            // Extract sunrise time
            if (daily.TryGetProperty("sunrise", out JsonElement sunrise))
            {
                string sunriseStr = sunrise.EnumerateArray().First().GetString();
                if (DateTime.TryParse(sunriseStr, out DateTime sunriseTime))
                {
                    dayInfo.SunriseHour = sunriseTime.Hour;
                    dayInfo.SunriseMinute = sunriseTime.Minute;
                }
            }
                
            // Extract sunset time
            if (daily.TryGetProperty("sunset", out JsonElement sunset))
            {
                string sunsetStr = sunset.EnumerateArray().First().GetString();
                if (DateTime.TryParse(sunsetStr, out DateTime sunsetTime))
                {
                    dayInfo.SunsetHour = sunsetTime.Hour;
                    dayInfo.SunsetMinute = sunsetTime.Minute;
                }
            }
                
            return dayInfo;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error fetching day info: {ex.Message}");
            throw;
        }
    }
}