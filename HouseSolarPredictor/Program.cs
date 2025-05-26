﻿using HouseSolarPredictor.EnergySupply;
 using HouseSolarPredictor.EnergySupply.Octopus;
 using HouseSolarPredictor.Load;
 using HouseSolarPredictor.Planning.Optimisers;
 using HouseSolarPredictor.Prediction;
 using HouseSolarPredictor.Solar;
 using HouseSolarPredictor.Time;
 using HouseSolarPredictor.Weather;
 using NodaTime;

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

        await GenerateChargingPlanAsync(targetDate, weatherClient, octopusClient);
    }

    private static LocalDate GetTargetDateFromUser()
    {
        Console.Write("Enter date for optimization (YYYY-MM-DD) or press Enter for tomorrow: ");
        var dateInput = Console.ReadLine();
        
        if (string.IsNullOrWhiteSpace(dateInput))
        {
            return LocalDate.FromDateTime(DateTime.Today.AddDays(1));
        }
        
        if (!DateTime.TryParse(dateInput, out var targetDate))
        {
            Console.WriteLine("Invalid date format. Using tomorrow instead.");
            return LocalDate.FromDateTime(DateTime.Today.AddDays(1));
        }
        
        return LocalDate.FromDateTime(DateTime.SpecifyKind(targetDate, DateTimeKind.Local));
    }

    private static async Task GenerateChargingPlanAsync(
        LocalDate targetDate,
        OpenMeteoClient weatherClient,
        OctopusApiClient octopusClient)
    {
        Console.WriteLine($"\nGenerating charging plan for {targetDate:yyyy-MM-dd}...");

        // Step 1: Get day info and climate data
        var dayInfo = await weatherClient.GetDayInfoAsync(targetDate);
        var dayInfoData = dayInfo.ToDictionary();
        // Create a list to store time segments (48 half-hour segments)
        var timeSegments = new List<TimeSegment>();
        // Dictionary to cache weather data by hour to minimize API calls
        var weatherDataCache = new Dictionary<int, WeatherData>();

        var historicalConsumption = await octopusClient.GetHistoricalConsumptionForPredictionAsync(targetDate);

        var temperatureRange = await FetchWeatherDataAndGetTemperatureRange(targetDate, weatherClient, weatherDataCache);
        var dailyHighTemp = temperatureRange.High;
        var dailyLowTemp = temperatureRange.Low;

        Console.WriteLine($"Daily temperature range: Low: {dailyLowTemp:F1}°C, High: {dailyHighTemp:F1}°C");

        var solarContextProvider = new SolarPredictionContextProvider(weatherDataCache, dayInfo);
        var solarPredictor = new SolarPredictor(
            "solar/model.onnx",
            "solar/scaling_params.json",
            "solar/computed_values.json",
            solarContextProvider);

        var loadContextProvider = new LoadPredictionContextProvider(
            weatherDataCache,
            dailyHighTemp,
            dailyLowTemp,
            historicalConsumption,
            targetDate);
        
        _loadEnergyPredictor = new LoadEnergyPredictor(
            "load/load_prediction_model.onnx",
            "load/load_feature_info.json",
            loadContextProvider);

        // Step 3: Predict solar generation for each half-hour
        Console.WriteLine("Predicting solar generation for each half-hour...");
        var lifePo4BatteryPredictor = new LifePo4BatteryPredictor(10m, 3m);
        var houseSimulator = new HouseSimulator(lifePo4BatteryPredictor);
        var fileLogger = new FileLogger("charge_plan.log");
        var graphBasedPlanOptimiser = new GraphBasedPlanOptimiser(lifePo4BatteryPredictor, houseSimulator, fileLogger);
        var chargePlanner = new ChargePlanner(
            solarPredictor,
            _loadEnergyPredictor,
            new OctopusSupplier(octopusClient),
            lifePo4BatteryPredictor,
            houseSimulator,
            graphBasedPlanOptimiser);

        chargePlanner.CreateChargePlan(targetDate, Kwh.Zero);
    }

    private static async Task<(float High, float Low)> FetchWeatherDataAndGetTemperatureRange(
        LocalDate targetDate, 
        OpenMeteoClient weatherClient,
        Dictionary<int, WeatherData> weatherDataCache)
    {
        var ukZone = DateTimeZoneProviders.Tzdb["Europe/London"];

        float dailyHighTemp = float.MinValue;
        float dailyLowTemp = float.MaxValue;

        Console.WriteLine("Fetching weather data for the day...");
        for (int hour = 0; hour < HoursPerDay; hour++)
        {
            var timePoint = targetDate.AtStartOfDayInZone(ukZone).PlusHours(hour);
            var weatherData = await weatherClient.GetWeatherDataAsync(timePoint.ToDateTimeUtc());
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

}