using System.Globalization;
using System.Text.Json;
using HouseSolarPredictor.Prediction;
using NodaTime;

namespace HouseSolarPredictor.Weather;

public class OpenMeteoClient
{
    private readonly HttpClient _httpClient;
    private ILogger _logger;

    private const float LATITUDE = 51.2856861f;
    private const float LONGITUDE = 1.0708219f;
        
    private const string API_BASE_URL = "https://api.open-meteo.com/v1/";

    // Cache for storing full day weather data
    private readonly Dictionary<string, DayWeatherCache> _weatherCache = new();
    private readonly Dictionary<string, DayInfo> _dayInfoCache = new();

    public OpenMeteoClient(ILogger logger)
    {
        _logger = logger;
        _httpClient = new HttpClient();
    }

    public async Task<WeatherData> GetWeatherDataAsync(DateTime timestamp)
    {
        string dateKey = timestamp.ToString("yyyy-MM-dd");
        
        // Check if we have cached data for this date
        if (_weatherCache.TryGetValue(dateKey, out DayWeatherCache cachedDay))
        {
            _logger.Log($"Using cached weather data for {dateKey}");
            return GetWeatherDataFromCache(cachedDay, timestamp);
        }

        // Cache miss - fetch full day data
        _logger.Log($"Cache miss for {dateKey}, fetching full day data from API");
        var dayCache = await FetchFullDayWeatherDataAsync(timestamp.Date);
        _weatherCache[dateKey] = dayCache;
        
        return GetWeatherDataFromCache(dayCache, timestamp);
    }

    private async Task<DayWeatherCache> FetchFullDayWeatherDataAsync(DateTime date)
    {
        string formattedDate = date.ToString("yyyy-MM-dd");
        var apiUrl = GetApiUrl(date, formattedDate);

        try
        {
            _logger.Log($"Fetching full day weather data from API: {apiUrl}");
            
            HttpResponseMessage response = await _httpClient.GetAsync(apiUrl);
            response.EnsureSuccessStatusCode();
                
            string responseBody = await response.Content.ReadAsStringAsync();
                
            using JsonDocument doc = JsonDocument.Parse(responseBody);
            JsonElement root = doc.RootElement;
                
            JsonElement hourlyData = root.GetProperty("hourly");
                
            // Get all timestamps for the day
            string[] timestamps = hourlyData.GetProperty("time").EnumerateArray()
                .Select(e => e.GetString())
                .ToArray();

            var dayCache = new DayWeatherCache();
            
            // Parse all hourly data for the day
            for (int i = 0; i < timestamps.Length; i++)
            {
                if (DateTime.TryParse(timestamps[i], out DateTime apiTimestamp))
                {
                    var weatherData = new WeatherData();
                    
                    weatherData.Temperature = GetWeatherValue(hourlyData, "temperature_2m", i);
                    weatherData.CloudCover = GetWeatherValue(hourlyData, "cloud_cover", i);
                    weatherData.CloudCoverLow = GetWeatherValue(hourlyData, "cloud_cover_low", i);
                    weatherData.CloudCoverMid = GetWeatherValue(hourlyData, "cloud_cover_mid", i);
                    weatherData.CloudCoverHigh = GetWeatherValue(hourlyData, "cloud_cover_high", i);
                    weatherData.WindSpeed = GetWeatherValue(hourlyData, "wind_speed_10m", i);
                    weatherData.ApparentTemperature = GetWeatherValue(hourlyData, "apparent_temperature", i);
                    weatherData.Precipitation = GetWeatherValue(hourlyData, "precipitation", i);
                    weatherData.DiffuseRadiation = GetWeatherValue(hourlyData, "diffuse_radiation", i);
                    weatherData.DirectRadiation = GetWeatherValue(hourlyData, "direct_radiation", i);
                    weatherData.TerrestrialRadiation = GetWeatherValue(hourlyData, "terrestrial_radiation", i);
                    weatherData.ShortwaveRadiation = GetWeatherValue(hourlyData, "shortwave_radiation", i);
                    
                    // Calculate global_tilted_irradiance as the sum of diffuse and direct radiation
                    weatherData.GlobalTiltedIrradiance = weatherData.DiffuseRadiation + weatherData.DirectRadiation;
                    
                    dayCache.HourlyData[apiTimestamp] = weatherData;
                }
            }
            
            return dayCache;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error fetching weather data: {ex.Message}");
            throw;
        }
    }

    private WeatherData GetWeatherDataFromCache(DayWeatherCache dayCache, DateTime targetTimestamp)
    {
        // Find the closest timestamp in the cached data
        DateTime closestTimestamp = dayCache.HourlyData.Keys
            .OrderBy(t => Math.Abs((t - targetTimestamp).Ticks))
            .First();
            
        _logger.Log($"Found closest cached timestamp {closestTimestamp} for requested {targetTimestamp}");
        return dayCache.HourlyData[closestTimestamp];
    }

    private string GetApiUrl(DateTime timestamp, string formattedDate)
    {
        if (timestamp.Date >= DateTime.Today.AddDays(-6))
        {
            _logger.Log($"Fetching forecast data as timestamp {timestamp} is today or in the future.");
            int forecastDays = Math.Max(1, (timestamp.Date - DateTime.Today).Days + 1);
            if (forecastDays > 15)
            {
                throw new ArgumentOutOfRangeException(nameof(timestamp), "Forecast is limited to 15 days in the future.");
            }
            
            return $"{API_BASE_URL}forecast?latitude={LATITUDE}&longitude={LONGITUDE}&hourly=temperature_2m,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,wind_speed_10m,apparent_temperature,precipitation,diffuse_radiation,direct_radiation,terrestrial_radiation,shortwave_radiation&forecast_days={forecastDays}&timezone=auto";
        }

        _logger.Log($"Fetching historical data as timestamp {timestamp} is in the past.");
        return $"{API_BASE_URL}archive?latitude={LATITUDE}&longitude={LONGITUDE}&start_date={formattedDate}&end_date={formattedDate}&hourly=temperature_2m,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,wind_speed_10m,apparent_temperature,precipitation,diffuse_radiation,direct_radiation,terrestrial_radiation,shortwave_radiation&timezone=auto";
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
        
    public async Task<DayInfo> GetDayInfoAsync(LocalDate date)
    {
        string dateKey = date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        
        // Check cache first
        if (_dayInfoCache.TryGetValue(dateKey, out DayInfo cachedDayInfo))
        {
            _logger.Log($"Using cached day info for {dateKey}");
            return cachedDayInfo;
        }

        // Construct API URL to get sun times
        string apiUrl = $"{API_BASE_URL}forecast?latitude={LATITUDE}&longitude={LONGITUDE}&daily=sunrise,sunset,daylight_duration,sunshine_duration&timezone=auto&start_date={dateKey}&end_date={dateKey}";
            
        try
        {
            _logger.Log($"Fetching day info from API: {apiUrl}");
            
            HttpResponseMessage response = await _httpClient.GetAsync(apiUrl);
            response.EnsureSuccessStatusCode();
                
            string responseBody = await response.Content.ReadAsStringAsync();
                
            using JsonDocument doc = JsonDocument.Parse(responseBody);
            JsonElement root = doc.RootElement;
                
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
            
            // Cache the result
            _dayInfoCache[dateKey] = dayInfo;
                
            return dayInfo;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error fetching day info: {ex.Message}");
            throw;
        }
    }
}

// Helper class to store cached weather data for a full day
public class DayWeatherCache
{
    public Dictionary<DateTime, WeatherData> HourlyData { get; set; } = new();
}