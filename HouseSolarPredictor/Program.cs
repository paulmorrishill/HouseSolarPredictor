﻿using HouseSolarPredictor.EnergySupply;
 using HouseSolarPredictor.EnergySupply.Octopus;
 using HouseSolarPredictor.Prediction;
 using HouseSolarPredictor.Solar;
 using HouseSolarPredictor.Time;
 using HouseSolarPredictor.Weather;

 namespace HouseSolarPredictor;

class Program
{
    private static LoadEnergyPredictor _loadEnergyPredictor;
    private const float BatteryCapacityKwh = 10.0f;
    private const float MaxChargingRateKw = 2.7f;
    private const float ChargingEfficiency = 0.9f;
    private const float DefaultHourlyConsumptionKwh = 0.5f;
    private const float DefaultBatteryChargePercentage = 0.5f;
    private const int HoursPerDay = 24;
    private const int MinutesPerHalfHour = 30;
    private const int ProgressReportIntervalHours = 6;

    private enum ChargingSource
    {
        Solar,
        Grid
    }
    
    // Moved OutputsMode enum to TimeSegment.cs

    static async Task Main(string[] args)
    {
        Console.WriteLine("\nSolar Battery Optimizer");
        Console.WriteLine("======================\n");

        var weatherClient = new OpenMeteoClient();
        
        Console.WriteLine("Initializing Octopus API client and auto-detecting tariff and region...");
        var octopusClient = ApiKeyProvider.GetOctopusClient();
        Console.WriteLine($"Using tariff: {octopusClient.TariffCode} in region: {octopusClient.RegionCode}");

        var targetDate = GetTargetDateFromUser();

        // Create battery optimizer
        var batteryOptimizer = new BatteryChargingOptimizer(
            BatteryCapacityKwh,
            MaxChargingRateKw,
            ChargingEfficiency);

        // Generate the charging plan
        await GenerateChargingPlanAsync(
            targetDate,
            weatherClient,
            octopusClient,
            batteryOptimizer);
    }

    private static DateTime GetTargetDateFromUser()
    {
        Console.Write("Enter date for optimization (YYYY-MM-DD) or press Enter for tomorrow: ");
        var dateInput = Console.ReadLine();
        
        if (string.IsNullOrWhiteSpace(dateInput))
        {
            return DateTime.Today.AddDays(1);
        }
        
        if (!DateTime.TryParse(dateInput, out var targetDate))
        {
            Console.WriteLine("Invalid date format. Using tomorrow instead.");
            return DateTime.Today.AddDays(1);
        }
        
        // Ensure DateTimeKind is set to Local
        return DateTime.SpecifyKind(targetDate, DateTimeKind.Local);
    }
    

    private static async Task GenerateChargingPlanAsync(
        DateTime targetDate,
        OpenMeteoClient weatherClient,
        OctopusApiClient octopusClient,
        BatteryChargingOptimizer batteryOptimizer)
    {
        Console.WriteLine($"\nGenerating charging plan for {targetDate:yyyy-MM-dd}...");

        // Step 1: Get day info and climate data
        var dayInfo = await weatherClient.GetDayInfoAsync(targetDate);
        var dayInfoData = dayInfo.ToDictionary(); // Convert to dictionary for compatibility

        // Create a list to store time segments (48 half-hour segments)
        var timeSegments = new List<TimeSegment>();

        // Dictionary to cache weather data by hour to minimize API calls
        var weatherDataCache = new Dictionary<int, WeatherData>();

        var historicalConsumption = await octopusClient.GetHistoricalConsumptionForPredictionAsync(targetDate);

        var temperatureRange = await FetchWeatherDataAndGetTemperatureRange(targetDate, weatherClient, weatherDataCache);
        var dailyHighTemp = temperatureRange.High;
        var dailyLowTemp = temperatureRange.Low;

        Console.WriteLine($"Daily temperature range: Low: {dailyLowTemp:F1}°C, High: {dailyHighTemp:F1}°C");

        // Initialize the solar predictor with context provider
        var solarContextProvider = new SolarPredictionContextProvider(weatherDataCache, dayInfo);
        var solarPredictor = new SolarPredictor(
            "model.onnx",
            "scaling_params.json",
            "computed_values.json",
            solarContextProvider);

        // Initialize the load predictor with context provider
        var loadContextProvider = new LoadPredictionContextProvider(
            weatherDataCache,
            dailyHighTemp,
            dailyLowTemp,
            historicalConsumption,
            targetDate);
        _loadEnergyPredictor = new LoadEnergyPredictor(
            "load_prediction_model.onnx",
            "load_feature_info.json",
            loadContextProvider);

        // Step 3: Predict solar generation for each half-hour
        Console.WriteLine("Predicting solar generation for each half-hour...");
        timeSegments = GenerateTimeSegments(
            targetDate, 
            solarPredictor, 
            weatherDataCache, 
            dayInfo, 
            historicalConsumption, 
            dailyHighTemp, 
            dailyLowTemp);

        // Fetch electricity prices
        Console.WriteLine("Fetching electricity prices from Octopus API...");
        var fromDate = targetDate;
        var toDate = targetDate.AddDays(1);
        var prices = await octopusClient.GetElectricityPricesAsync(fromDate, toDate);
        Console.WriteLine($"Fetched {prices.Count} price points");

        // Step 4: Assign prices to each time segment
        AssignPricesToTimeSegments(timeSegments, prices);
    }

    private static async Task<(float High, float Low)> FetchWeatherDataAndGetTemperatureRange(
        DateTime targetDate, 
        OpenMeteoClient weatherClient,
        Dictionary<int, WeatherData> weatherDataCache)
    {
        float dailyHighTemp = float.MinValue;
        float dailyLowTemp = float.MaxValue;

        Console.WriteLine("Fetching weather data for the day...");
        for (int hour = 0; hour < HoursPerDay; hour++)
        {
            var timePoint = targetDate.AddHours(hour);
            var weatherData = await weatherClient.GetWeatherDataAsync(timePoint);
            weatherDataCache[hour] = weatherData;

            // Update daily high and low temperatures
            dailyHighTemp = Math.Max(dailyHighTemp, weatherData.Temperature);
            dailyLowTemp = Math.Min(dailyLowTemp, weatherData.Temperature);

            // Show progress
            if (hour % ProgressReportIntervalHours == 0)
            {
                Console.WriteLine($"Fetched weather data for hour {hour}...");
            }
        }

        return (dailyHighTemp, dailyLowTemp);
    }

    private static List<TimeSegment> GenerateTimeSegments(
        DateTime targetDate,
        SolarPredictor solarPredictor,
        Dictionary<int, WeatherData> weatherDataCache,
        DayInfo dayInfo,
        Dictionary<DateTime, float> historicalConsumption,
        float dailyHighTemp,
        float dailyLowTemp)
    {
        var timeSegments = new List<TimeSegment>();

        for (int hour = 0; hour < HoursPerDay; hour++)
        {
            var weatherData = weatherDataCache[hour];

            // Predict for both :00 and :30 of each hour
            foreach (int minute in new[] { 0, MinutesPerHalfHour })
            {
                var startTime = targetDate.AddHours(hour).AddMinutes(minute);
                var endTime = startTime.AddMinutes(MinutesPerHalfHour);
                int dayOfYear = startTime.DayOfYear;

                // Create a charge segment for this time period
                var chargeSegment = new HalfHourSegment(hour, minute);
                
                // Predict solar generation for this time segment
                var solarPrediction = solarPredictor.PredictSolarEnergy(dayOfYear, chargeSegment);

                // Predict load energy with all available data
                var expectedConsumption = _loadEnergyPredictor.PredictLoad(dayOfYear, chargeSegment);

                var segment = new TimeSegment
                {
                    StartTime = startTime,
                    EndTime = endTime,
                    SolarGeneration = solarPrediction,
                    EstimatedConsumption = expectedConsumption
                };

                timeSegments.Add(segment);
            }
        }

        // Initialize PredictedState for each segment
        foreach (var segment in timeSegments)
        {
            segment.PredictedState.StartBatteryChargeKwh = 0; // Will be calculated during optimization
            segment.PredictedState.EndBatteryChargeKwh = 0;   // Will be calculated during optimization
            segment.PredictedState.SolarPercentage = 0;
            segment.PredictedState.GridPercentage = 0;
            segment.PredictedState.BatteryPercentage = 0;
        }
        
        return timeSegments;
    }

    private static void AssignPricesToTimeSegments(List<TimeSegment> timeSegments, List<EnergyPrice> prices)
    {
        foreach (var segment in timeSegments)
        {
            var pricePoint = prices.Find(p =>
                segment.StartTime >= p.ValidFrom && segment.StartTime < p.ValidTo);

            if (pricePoint != null)
            {
                segment.EnergyPrice = pricePoint.PricePerKwh;
                continue;
            }
            
            throw new ElectricitySupplierException($"Warning: No price data found for {segment.StartTime}.");
        }
        
    }
    
    private static void DisplayChargingPlan(List<TimeSegment> chargingPlan, DateTime targetDate, float totalAverageCost)
    {
        Console.WriteLine("\nCharging Schedule:");
    }


}

internal class ElectricitySupplierException : Exception
{
    public ElectricitySupplierException(string s) : base(s)
    {
    }
}