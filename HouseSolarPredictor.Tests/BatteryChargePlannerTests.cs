using FluentAssertions;
using HouseSolarPredictor.EnergySupply;
using HouseSolarPredictor.Load;
using HouseSolarPredictor.Prediction;
using HouseSolarPredictor.Time;
using NodaTime;
using NSubstitute;
using NUnit.Framework;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace HouseSolarPredictor.Tests;

public class BatteryChargePlannerTests
{
    private BatteryChargePlanner _batteryChargePlanner;
    private ISolarPredictor _solarPredictor;
    private ILoadPredictor _loadPredictor;
    private ISupplier _supplier;
    private LocalDate _testDay;

    
    [SetUp]
    public void Setup()
    {
        _solarPredictor = Substitute.For<ISolarPredictor>();
        _loadPredictor = Substitute.For<ILoadPredictor>();
        _supplier = Substitute.For<ISupplier>();
        _testDay = new LocalDate(2023, 1, 1);

        var testBatteryPredictor = new TestBatteryPredictor();
        var houseSimulator = new HouseSimulator(testBatteryPredictor);
        _batteryChargePlanner = new BatteryChargePlanner(_solarPredictor, 
            _loadPredictor, 
            _supplier, 
            testBatteryPredictor, 
            houseSimulator,
            new FileLogger("test.log"));
    }

    [Test]
    public async Task GivenSolarWillBeHighAllDayChargesFromSolarOnly()
    {
        GivenSolarGenerationForAllSegmentsIs(10);
        GivenLoadForAllSegmentsIs(2);
        GivenPriceForAllSegmentsIs(4);

        var chargePlan = await _batteryChargePlanner.CreateChargePlan(_testDay);
        
        // All 12 segments: 10kWh solar, 2kWh load = 8kWh excess solar per segment
        // Total excess: 12 * 8 = 96kWh wasted solar
        // Assuming £5 penalty per kWh wasted: 96 * £5 = £480
        decimal optimalCost = 480m;
        
        AssertPlanCost(chargePlan, optimalCost);
    }

    [Test]
    public async Task GivenGridWillBeSameAllDayKeepsBatteryNotCharging()
    {
        GivenSolarGenerationForAllSegmentsIs(0);
        GivenLoadForAllSegmentsIs(1);
        GivenPriceForAllSegmentsIs(4);

        var chargePlan = await _batteryChargePlanner.CreateChargePlan(_testDay);
        
        // 12 segments * 1 kWh load * £4 per kWh = £48
        decimal optimalCost = 48m;
        
        AssertPlanCost(chargePlan, optimalCost);
    }
    
    [Test]
    public async Task GivenGridWillBeExpensiveInAfternoonItChargesEarlyToCapacity()
    {
        GivenSolarGenerationForAllSegmentsIs(0);
        GivenLoadForAllSegmentsIs(1);
        GivenPriceForAllSegmentsIs(2);
        GivenPriceForHours("10-12", 7);

        var chargePlan = await _batteryChargePlanner.CreateChargePlan(_testDay);
        
        // 10 segments * 1 kWh load * £2 per kWh = £20 (cheap periods)
        // 2 segments * 1 kWh load * £7 per kWh = £14 (expensive periods)
        // Optimal: charge 2kWh battery during cheap periods (costs £4) and use during expensive periods
        // Cost: 8 segments * £2 + 2 segments charging * £2 + 2 segments from battery * £0 = £20
        decimal optimalCost = 20m;
        
        AssertPlanCost(chargePlan, optimalCost);
    }

    [Test]
    public async Task GivenSolarExceedsLoadItChargesBatteryWithExcess()
    {
        GivenSolarGenerationForAllSegmentsIs(5);
        GivenLoadForAllSegmentsIs(2);
        GivenPriceForAllSegmentsIs(4);

        var chargePlan = await _batteryChargePlanner.CreateChargePlan(_testDay);
        
        // Each segment: 5kWh solar, 2kWh load = 3kWh excess
        // Can charge battery with up to 10kWh total, so first ~3.33 segments charge battery
        // Total excess solar: 3 * 12 = 36kWh
        // Wasted solar: 36 - 10 = 26kWh (assuming battery capacity is 10kWh)
        decimal optimalCost = 130m;
        
        AssertPlanCost(chargePlan, optimalCost);
    }

    [Test]
    public async Task GivenHighestPricesInEveningItSavesCapacityForThen()
    {
        GivenSolarGenerationIs(new[] { 0, 0, 0, 3, 5, 5, 5, 3, 0, 0, 0, 0 });
        GivenLoadIs(new[] { 1, 1, 1, 1, 1, 1, 1, 1, 3, 3, 3, 3 });
        GivenPriceIs(new[] { 3, 3, 3, 2, 2, 2, 2, 2, 8, 8, 8, 8 });

        var chargePlan = await _batteryChargePlanner.CreateChargePlan(_testDay);
        
        // First 3 segments: 3 * 1kWh * £3 = £9 (no solar, buy from grid)
        // Segments 4-8: Solar covers load, excess charges battery
        // Solar excess: (3-1) + (5-1) + (5-1) + (5-1) + (3-1) = 2+4+4+4+2 = 16kWh
        // Can charge 10kWh to battery, waste 6kWh: 6 * £5 = £30
        // Last 4 segments: 4 * 3kWh = 12kWh needed, 10kWh from battery, 2kWh from grid
        // Grid cost: 2kWh * £8 = £16
        // Total: £9 + £30 + £16 = £55
        decimal optimalCost = 55m;
        
        AssertPlanCost(chargePlan, optimalCost);
    }

    [Test]
    public async Task GivenPriceDipDuringDayItUsesGridToCharge()
    {
        GivenSolarGenerationIs(new[] { 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0 });
        GivenLoadIs(new[] { 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2 });
        GivenPriceIs(new[] { 5, 5, 5, 5, 1, 1, 5, 5, 5, 5, 5, 5 });

        var chargePlan = await _batteryChargePlanner.CreateChargePlan(_testDay);
        
        // Total load: 12 * 2kWh = 24kWh
        // Solar covers: 4 * 1kWh = 4kWh
        // Remaining: 20kWh needed from grid/battery
        // Optimal: charge 10kWh battery during segments 5-6 (£1 price), use during expensive periods
        // Charging cost: 10kWh * £1 = £10
        // Load during cheap segments: 2 * 2kWh * £1 = £4 (segments 5-6)
        // Remaining load from expensive segments: 18kWh - 10kWh(battery) = 8kWh * £5 = £40
        // Total: £10 + £4 + £40 = £54
        decimal optimalCost = 54m;
        
        AssertPlanCost(chargePlan, optimalCost);
    }

    [Test]
    public async Task GivenBatteryStartsFullItDischargesDuringHighPrices()
    {
        GivenBatteryStartsAt(10);
        GivenSolarGenerationForAllSegmentsIs(0);
        GivenLoadForAllSegmentsIs(2);
        GivenPriceIs(new[] { 2, 2, 2, 5, 5, 5, 5, 5, 5, 2, 2, 2 });

        var chargePlan = await _batteryChargePlanner.CreateChargePlan(_testDay);
        
        // Total load: 12 * 2kWh = 24kWh
        // Battery provides: 10kWh during high price periods (segments 4-9)
        // Remaining 14kWh from grid: 6 segments * 2kWh * £2 = £24 (low price segments)
        // High price segments: 6 * 2kWh = 12kWh needed, 10kWh from battery, 2kWh * £5 = £10
        // Total: £24 + £10 = £34
        decimal optimalCost = 34m;
        
        AssertPlanCost(chargePlan, optimalCost);
    }

    [Test]
    public async Task GivenNoSolarAndHigherPricesLaterItDoesNotCharge()
    {
        GivenSolarGenerationForAllSegmentsIs(0);
        GivenLoadForAllSegmentsIs(1);
        GivenPriceIs(new[] { 4, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6 });

        var chargePlan = await _batteryChargePlanner.CreateChargePlan(_testDay);
        
        // Since prices only increase gradually, charging battery early doesn't save money
        // Total: 5 * 1kWh * £4 + 4 * 1kWh * £5 + 3 * 1kWh * £6 = £20 + £20 + £18 = £58
        decimal optimalCost = 58m;
        
        AssertPlanCost(chargePlan, optimalCost);
    }

    [Test]
    public async Task GivenExtremelyLowPriceFollowedByHighItChargesFullyDuringLowPrice()
    {
        GivenSolarGenerationForAllSegmentsIs(0);
        GivenLoadForAllSegmentsIs(1);
        GivenPriceIs(new[] { 10, 10, 1, 1, 10, 10, 10, 10, 10, 10, 10, 10 });

        var chargePlan = await _batteryChargePlanner.CreateChargePlan(_testDay);
        
        // First 2 segments: 2 * 1kWh * £10 = £20
        // Segments 3-4: Load costs 2 * 1kWh * £1 = £2, plus charge 8kWh battery * £1 = £8
        // Remaining 8 segments: 8 * 1kWh from battery = £0 (battery provides power)
        // Total: £20 + £2 + £8 = £30
        decimal optimalCost = 30m;
        
        AssertPlanCost(chargePlan, optimalCost);
    }

    [Test]
    public async Task GivenMixOfSolarAndPriceVariationsItOptimizesCorrectly()
    {
        GivenSolarGenerationIs(new[] { 0, 0, 0, 0, 3, 5, 5, 3, 0, 0, 0, 0 });
        GivenLoadIs(new[] { 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2 });
        GivenPriceIs(new[] { 2, 2, 2, 2, 2, 2, 2, 3, 8, 8, 8, 8 });

        var chargePlan = await _batteryChargePlanner.CreateChargePlan(_testDay);
        
        // First 4 segments: 4 * 1kWh * £2 = £8 (no solar)
        // Segments 5-8: Solar covers load plus excess for battery
        // Solar excess: (3-1) + (5-1) + (5-1) + (3-1) = 2+4+4+2 = 12kWh
        // Can charge 10kWh to battery, waste 2kWh: 2 * £5 = £10
        // Last 4 segments: 4 * 2kWh = 8kWh needed, all from battery = £0
        // Total: £8 + £10 = £18
        decimal optimalCost = 18m;
        
        AssertPlanCost(chargePlan, optimalCost);
    }

    private void GivenBatteryStartsAt(decimal initialCharge)
    {
        // This would need to be implemented in the BatteryChargePlanner
    }

    private void GivenPriceForHours(string range, decimal pricePerKwh)
    {
        var parts = range.Split('-');
        var startHour = int.Parse(parts[0]);
        var endHour = int.Parse(parts[1]);
        
        foreach (var segment in HalfHourSegments.AllSegments)
        {
            if (segment.HourStart >= startHour && segment.HourStart < endHour)
            {
                _supplier.GetPrice(_testDay, segment).Returns(new ElectricityRate(new Gbp(pricePerKwh)));
            }
        }
    }

    private void GivenSolarGenerationIs(decimal[] values)
    {
        for (var i = 0; i < HalfHourSegments.AllSegments.Count; i++)
        {
            var value = i < values.Length ? values[i] : 0m;
            _solarPredictor.PredictSolarEnergy(_testDay.DayOfYear, HalfHourSegments.AllSegments[i])
                .Returns(new Kwh(value));
        }
    }
    
    private void GivenSolarGenerationIs(int[] values)
    {
        GivenSolarGenerationIs(values.Select(v => (decimal)v).ToArray());
    }

    private void GivenLoadIs(decimal[] values)
    {
        for (var i = 0; i < HalfHourSegments.AllSegments.Count; i++)
        {
            var value = i < values.Length ? values[i] : 0m;
            _loadPredictor.PredictLoad(_testDay.DayOfYear, HalfHourSegments.AllSegments[i])
                .Returns(new Kwh(value));
        }
    }
    
    private void GivenLoadIs(int[] values)
    {
        GivenLoadIs(values.Select(v => (decimal)v).ToArray());
    }

    private void GivenPriceIs(decimal[] values)
    {
        for (var i = 0; i < HalfHourSegments.AllSegments.Count; i++)
        {
            var value = i < values.Length ? values[i] : values.LastOrDefault();
            _supplier.GetPrice(_testDay, HalfHourSegments.AllSegments[i])
                .Returns(new ElectricityRate(new Gbp(value)));
        }
    }
    
    private void GivenPriceIs(int[] values)
    {
        GivenPriceIs(values.Select(v => (decimal)v).ToArray());
    }

    private void AssertPlanCost(List<TimeSegment> chargePlan, decimal optimalCost)
    {
        // Calculate the actual cost of the plan
        var actualCost = chargePlan.CalculatePlanCost().PoundsAmount;
        actualCost.Should().NotBe(0, "the plan cost should not be zero, something has gone wrong somewhere");
        // Print a nicely formatted table of the plan
        PrintPlanTable(chargePlan);
        
        // Assert that the actual cost is within an acceptable threshold of the optimal cost
        var costThreshold = optimalCost * 1.05m; // Allow 5% deviation from optimal
        Console.WriteLine($"\nOptimal Cost: £{optimalCost:F2}");
        Console.WriteLine($"Actual Cost: £{actualCost:F2}");
        Console.WriteLine($"Threshold: £{costThreshold:F2}");
        
        actualCost.Should().BeLessThanOrEqualTo(costThreshold,
            $"The plan cost (£{actualCost:F2}) should not exceed the threshold (£{costThreshold:F2})");
    }
    
    private void PrintPlanTable(List<TimeSegment> chargePlan)
    {
        // Define column widths
        const int timeWidth = 12;
        const int modeWidth = 30;
        const int numberWidth = 10;
        
        // Print header
        var header = $"| {"Time",-timeWidth} | {"Mode",-modeWidth} | {"Solar",-numberWidth} | {"Load",-numberWidth} | " +
                     $"{"Price",-numberWidth} | {"Batt Start",-numberWidth} | {"Batt End",-numberWidth} | " +
                     $"{"Wasted",-numberWidth} | {"Cost",-numberWidth} |";
        
        var separator = new string('-', header.Length);
        
        Console.WriteLine(separator);
        Console.WriteLine(header);
        Console.WriteLine(separator);
        
        // Print each row
        Gbp totalCost = Gbp.Zero;
        Kwh totalWastedSolar = Kwh.Zero;
        
        foreach (var segment in chargePlan)
        {
            var time = $"{segment.HalfHourSegment.HourStart:D2}:{segment.HalfHourSegment.MinuteStart:D2}-{segment.HalfHourSegment.HourEnd:D2}:{segment.HalfHourSegment.MinuteEnd:D2}";
            var solar = segment.ExpectedSolarGeneration;
            var load = segment.ExpectedConsumption;
            var price = segment.GridPrice;
            var battStart = segment.StartBatteryChargeKwh;
            var battEnd = segment.EndBatteryChargeKwh;
            var wasted = segment.WastedSolarGeneration ?? Kwh.Zero;
            
            // Calculate segment cost
            Gbp segmentCost = segment.Cost();
            totalCost += segmentCost;
            totalWastedSolar += wasted;
            
            var row = $"| {time,-timeWidth} | {segment.Mode,-modeWidth} | {solar.Value,numberWidth:F2} | {load.Value,numberWidth:F2} | " +
                      $"{price.PricePerKwh.PoundsAmount,numberWidth:F2} | {battStart.Value,numberWidth:F2} | {battEnd.Value,numberWidth:F2} | " +
                      $"{wasted.Value,numberWidth:F2} | {segmentCost,numberWidth:F2} |";
            
            Console.WriteLine(row);
        }
        
        Console.WriteLine(separator);
        Console.WriteLine($"| {"TOTAL",-timeWidth} | {"",-modeWidth} | {"",-numberWidth} | {"",-numberWidth} | " +
                          $"{"",-numberWidth} | {"",-numberWidth} | {"",-numberWidth} | " +
                          $"{totalWastedSolar,numberWidth:F2} | {totalCost,numberWidth:F2} |");
        Console.WriteLine(separator);
    }

    private void GivenPriceForAllSegmentsIs(decimal price)
    {
        foreach (var segment in HalfHourSegments.AllSegments)
        {
            _supplier.GetPrice(_testDay, segment).Returns(new ElectricityRate(new Gbp(price)));
        }
    }

    private void GivenLoadForAllSegmentsIs(decimal load)
    {
        foreach (var segment in HalfHourSegments.AllSegments)
        {
            _loadPredictor.PredictLoad(_testDay.DayOfYear, segment).Returns(new Kwh(load));
        }
    }

    private void GivenSolarGenerationForAllSegmentsIs(decimal solarGenForSegment)
    {
        foreach (var segment in HalfHourSegments.AllSegments)
        {
            _solarPredictor.PredictSolarEnergy(_testDay.DayOfYear, segment).Returns(new Kwh(solarGenForSegment));
        }
    }
}

public class FileLogger : ILogger
{
    private string _filePath;
    // buffer
    private const int BufferSize = 3000;
    private StringBuilder _logBuffer = new StringBuilder();
    
    public FileLogger(string file)
    {
        _filePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, file);
        // delete
        if (File.Exists(_filePath))
        {
            File.Delete(_filePath);
        }
    }

    public void Log(string message)
    {
        _logBuffer.AppendLine(message);
        
        // If buffer exceeds size, write to file
        if (_logBuffer.Length >= BufferSize)
        {
            // if file too large truncate
            if (File.Exists(_filePath) && new FileInfo(_filePath).Length > 1000000) // 1MB limit
            {
                File.WriteAllText(_filePath, string.Empty); // clear file
            }
            File.AppendAllText(_filePath, _logBuffer.ToString());
            _logBuffer.Clear();
        }
    }
}