﻿using HouseSolarPredictor.EnergySupply;
 using HouseSolarPredictor.EnergySupply.Octopus;
 using HouseSolarPredictor.Load;
 using HouseSolarPredictor.Planning.Optimisers;
 using HouseSolarPredictor.Prediction;
 using HouseSolarPredictor.Solar;
 using HouseSolarPredictor.Time;
 using HouseSolarPredictor.Weather;
 using HouseSolarPredictor.Planning;
 using Newtonsoft.Json;
 using NodaTime;

 namespace HouseSolarPredictor;

class Program
{
    private static LoadEnergyPredictor _loadEnergyPredictor;
    private const int HoursPerDay = 24;
    private const int ProgressReportIntervalHours = 6;
    private static readonly ILogger FileLogger = new FileLogger("charge_plan.log");

    static async Task<int> Main(string[] args)
    {
        if (args.Length == 1 && (args[0] == "--help" || args[0] == "-h"))
        {
            DisplayUsage();
            return 0;
        }

        Console.WriteLine("\nSolar Battery Optimizer");
        Console.WriteLine("======================\n");

        if (args.Length >= 2)
        {
            // Non-interactive mode
            return await RunNonInteractiveMode(args);
        }
        else if (args.Length == 1)
        {
            Console.WriteLine("Error: Both API key and account number are required for non-interactive mode.");
            Console.WriteLine("Use --help for usage information.");
            return 1;
        }
        else
        {
            // Interactive mode
            return await RunInteractiveMode();
        }
    }

    private static async Task<int> RunNonInteractiveMode(string[] args)
    {
        try
        {
            var apiKey = args[0];
            var accountNumber = args[1];

            if (string.IsNullOrWhiteSpace(apiKey) || string.IsNullOrWhiteSpace(accountNumber))
            {
                Console.WriteLine("Error: API key and account number cannot be empty.");
                return 1;
            }

            Console.WriteLine("Using provided credentials and auto-detecting tariff and region...");
            var octopusClient = new OctopusApiClient(apiKey, accountNumber);
            Console.WriteLine($"Using tariff: {octopusClient.TariffCode} in region: {octopusClient.RegionCode}");

            LocalDate targetDate;
            if (args.Length > 2 && !string.IsNullOrWhiteSpace(args[2]))
            {
                if (DateTime.TryParse(args[2], out var parsedDate))
                {
                    targetDate = LocalDate.FromDateTime(DateTime.SpecifyKind(parsedDate, DateTimeKind.Local));
                    Console.WriteLine($"Using provided date: {targetDate:yyyy-MM-dd}");
                }
                else
                {
                    Console.WriteLine($"Error: Invalid date format '{args[2]}'. Expected YYYY-MM-DD format.");
                    return 1;
                }
            }
            else
            {
                targetDate = LocalDate.FromDateTime(DateTime.Today.AddDays(1));
                Console.WriteLine($"Using default date (tomorrow): {targetDate:yyyy-MM-dd}");
            }

            await GenerateAndSaveSchedule(targetDate, octopusClient);
            return 0;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error: {ex.Message}");
            return 1;
        }
    }

    private static async Task<int> RunInteractiveMode()
    {
        try
        {
            Console.WriteLine("Initializing Octopus API client and auto-detecting tariff and region...");
            var octopusClient = ApiKeyProvider.GetOctopusClient();
            Console.WriteLine($"Using tariff: {octopusClient.TariffCode} in region: {octopusClient.RegionCode}");

            var targetDate = GetTargetDateFromUser();

            await GenerateChargingPlanAsync(targetDate, new OpenMeteoClient(FileLogger), octopusClient);
            return 0;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error: {ex.Message}");
            return 1;
        }
    }

    private static async Task GenerateAndSaveSchedule(LocalDate targetDate, OctopusApiClient octopusClient)
    {
        var weatherClient = new OpenMeteoClient(FileLogger);
        var plan = await CreateChargePlan(targetDate, weatherClient, octopusClient);
        await SaveScheduleToFile(plan, targetDate);
    }

    private static async Task<IEnumerable<TimeSegment>> CreateChargePlan(LocalDate targetDate, OpenMeteoClient weatherClient, OctopusApiClient octopusClient)
    {
        Console.WriteLine($"\nGenerating charging plan for {targetDate:yyyy-MM-dd}...");

        var dayInfo = await weatherClient.GetDayInfoAsync(targetDate);
        var weatherDataCache = new Dictionary<int, WeatherData>();
        var historicalConsumption = await octopusClient.GetHistoricalConsumptionForPredictionAsync(targetDate);
        var temperatureRange = await FetchWeatherDataAndGetTemperatureRange(targetDate, weatherClient, weatherDataCache);

        Console.WriteLine($"Daily temperature range: Low: {temperatureRange.Low:F1}°C, High: {temperatureRange.High:F1}°C");

        var solarContextProvider = new SolarPredictionContextProvider(weatherDataCache, dayInfo);
        var solarPredictor = new SolarPredictor(
            "Solar/model.onnx",
            "Solar/scaling_params.json",
            "Solar/computed_values.json",
            solarContextProvider);

        var loadContextProvider = new LoadPredictionContextProvider(
            weatherDataCache,
            temperatureRange.High,
            temperatureRange.Low,
            historicalConsumption,
            targetDate);

        _loadEnergyPredictor = new LoadEnergyPredictor(
            "Load/load_prediction_model.onnx",
            "Load/load_feature_info.json",
            loadContextProvider);

        Console.WriteLine("Predicting solar generation for each half-hour...");
        var lifePo4BatteryPredictor = new LifePo4BatteryPredictor(10m, 2.74m / 2m);
        var houseSimulator = new HouseSimulator(lifePo4BatteryPredictor);
        var graphBasedPlanOptimiser = new GraphBasedPlanOptimiser(lifePo4BatteryPredictor, houseSimulator, FileLogger);
        var chargePlanner = new ChargePlanner(
            solarPredictor,
            _loadEnergyPredictor,
            new OctopusSupplier(octopusClient, FileLogger),
            lifePo4BatteryPredictor,
            houseSimulator,
            graphBasedPlanOptimiser);

        return await chargePlanner.CreateChargePlan(targetDate, Kwh.Zero);
    }

    private static async Task SaveScheduleToFile(IEnumerable<TimeSegment> plan, LocalDate targetDate)
    {
        var ukZone = DateTimeZoneProviders.Tzdb["Europe/London"];
        var mappedPlan = plan.Select(s =>
        {
            var endTime = s.HalfHourSegment.End().On(targetDate);
            if (endTime < s.HalfHourSegment.Start().On(targetDate))
            {
                endTime = endTime.PlusDays(1);
            }
            return new ScheduleSegment
            {
                Time = new TimeInfo
                {
                    SegmentStart = s.HalfHourSegment.Start().On(targetDate).InZoneLeniently(ukZone).ToDateTimeUtc(),
                    SegmentEnd = endTime.InZoneLeniently(ukZone).ToDateTimeUtc()
                },
                Mode = s.Mode.ToString(),
                ExpectedSolarGeneration = (decimal)s.ExpectedSolarGeneration.Value,
                ExpectedConsumption = (decimal)s.ExpectedConsumption.Value,
                ActualGridUsage = (decimal)s.ActualGridUsage.Value,
                GridPrice = (decimal)s.GridPrice.PricePerKwh.PoundsAmount,
                StartBatteryChargeKwh = (decimal)s.StartBatteryChargeKwh.Value,
                EndBatteryChargeKwh = (decimal)s.EndBatteryChargeKwh.Value,
                WastedSolarGeneration = (decimal)s.WastedSolarGeneration.Value,
                Cost = s.Cost().PoundsAmount
            };
        });

        var fullPath = Path.GetFullPath(AppDomain.CurrentDomain.BaseDirectory + "../../..");
        var scheduleFilePath = Path.Combine(fullPath, "executor/backend/schedules/schedule.json");
        var scheduleFileManager = new ScheduleFileManager(scheduleFilePath);
        await scheduleFileManager.SaveScheduleAsync(mappedPlan);

        Console.WriteLine($"Schedule saved to {scheduleFilePath}");
    }

    private static void DisplayUsage()
    {
        Console.WriteLine("Solar Battery Optimizer");
        Console.WriteLine("======================");
        Console.WriteLine();
        Console.WriteLine("Usage:");
        Console.WriteLine("  Interactive mode:");
        Console.WriteLine("    HouseSolarPredictor.exe");
        Console.WriteLine();
        Console.WriteLine("  Non-interactive mode:");
        Console.WriteLine("    HouseSolarPredictor.exe <apiKey> <accountNumber> [date]");
        Console.WriteLine();
        Console.WriteLine("Parameters:");
        Console.WriteLine("  apiKey        - Octopus Energy API key (required in non-interactive mode)");
        Console.WriteLine("  accountNumber - Octopus Energy account number (required in non-interactive mode)");
        Console.WriteLine("  date          - Target date in YYYY-MM-DD format (optional, defaults to tomorrow)");
        Console.WriteLine();
        Console.WriteLine("Examples:");
        Console.WriteLine("  HouseSolarPredictor.exe sk_live_abc123 A-12345678");
        Console.WriteLine("  HouseSolarPredictor.exe sk_live_abc123 A-12345678 2024-12-25");
        Console.WriteLine();
        Console.WriteLine("Note: Tariff and region codes are automatically detected from your account.");
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
            "Solar/model.onnx",
            "Solar/scaling_params.json",
            "Solar/computed_values.json",
            solarContextProvider);

        var loadContextProvider = new LoadPredictionContextProvider(
            weatherDataCache,
            dailyHighTemp,
            dailyLowTemp,
            historicalConsumption,
            targetDate);

        _loadEnergyPredictor = new LoadEnergyPredictor(
            "Load/load_prediction_model.onnx",
            "Load/load_feature_info.json",
            loadContextProvider);

        // Step 3: Predict solar generation for each half-hour
        Console.WriteLine("Predicting solar generation for each half-hour...");
        var lifePo4BatteryPredictor = new LifePo4BatteryPredictor(10m, 2.74m / 2m);
        var houseSimulator = new HouseSimulator(lifePo4BatteryPredictor);
        var graphBasedPlanOptimiser = new GraphBasedPlanOptimiser(lifePo4BatteryPredictor, houseSimulator, FileLogger);
        var chargePlanner = new ChargePlanner(
            solarPredictor,
            _loadEnergyPredictor,
            new OctopusSupplier(octopusClient, FileLogger),
            lifePo4BatteryPredictor,
            houseSimulator,
            graphBasedPlanOptimiser);

        var plan = await chargePlanner.CreateChargePlan(targetDate, Kwh.Zero);
        plan.PrintPlanTable();
        plan.PrintPlanTableToHtml();

        var ukZone = DateTimeZoneProviders.Tzdb["Europe/London"];
        var mappedPlan = plan.Select(s =>
        {
            var endTime = s.HalfHourSegment.End().On(targetDate);
            if (endTime < s.HalfHourSegment.Start().On(targetDate))
            {
                endTime = endTime.PlusDays(1);
            }
            return new ScheduleSegment
            {
                Time = new TimeInfo
                {
                    SegmentStart = s.HalfHourSegment.Start().On(targetDate).InZoneLeniently(ukZone).ToDateTimeUtc(),
                    SegmentEnd = endTime.InZoneLeniently(ukZone).ToDateTimeUtc()
                },
                Mode = s.Mode.ToString(),
                ExpectedSolarGeneration = (decimal)s.ExpectedSolarGeneration.Value,
                ExpectedConsumption = (decimal)s.ExpectedConsumption.Value,
                ActualGridUsage = (decimal)s.ActualGridUsage.Value,
                GridPrice = (decimal)s.GridPrice.PricePerKwh.PoundsAmount,
                StartBatteryChargeKwh = (decimal)s.StartBatteryChargeKwh.Value,
                EndBatteryChargeKwh = (decimal)s.EndBatteryChargeKwh.Value,
                WastedSolarGeneration = (decimal)s.WastedSolarGeneration.Value,
                Cost = s.Cost().PoundsAmount
            };
        });

        // Save using the new schedule file manager
        var fullPath = Path.GetFullPath(AppDomain.CurrentDomain.BaseDirectory + "../../..");
        var scheduleFilePath = Path.Combine(fullPath, "executor/backend/schedules/schedule.json");
        var scheduleFileManager = new ScheduleFileManager(scheduleFilePath);
        await scheduleFileManager.SaveScheduleAsync(mappedPlan);

        Console.WriteLine($"Schedule saved to {scheduleFilePath}");
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