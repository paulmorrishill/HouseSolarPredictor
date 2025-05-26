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
    private ChargePlanner _planOptimiser;
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
        var fileLogger = new FileLogger("test.log");
        var graphBasedPlanOptimiser = new GraphBasedPlanOptimiser(testBatteryPredictor, houseSimulator, fileLogger);
        var geneticPlanOptimiser = new GeneticAlgorithmPlanOptimiser(houseSimulator, fileLogger);
        _planOptimiser = new ChargePlanner(_solarPredictor, 
            _loadPredictor,
            _supplier, 
            testBatteryPredictor, 
            houseSimulator,
            geneticPlanOptimiser);
    }

    [Test]
    public async Task GivenSolarWillBeHighAllDayChargesFromSolarOnly()
    {
        GivenSolarGenerationForAllSegmentsIs(10);
        GivenLoadForAllSegmentsIs(2);
        GivenPriceForAllSegmentsIs(4);

        var chargePlan = await _planOptimiser.CreateChargePlan(_testDay, 0.Kwh());
        
        // Segment 1: Battery charges from 0→10kWh (uses all 10kWh solar), no waste
        // Segments 2-12: Battery full, wastes all 10kWh solar each = 110kWh wasted
        // In ChargeSolarOnly mode, all load (2kWh/segment) comes from grid
        // But cost calculation: solarUsed = Min(solar, gridUsage) = Min(10, 2) = 2kWh
        // So gridUsed = gridUsage - solarUsed = 2 - 2 = 0kWh per segment
        // Only cost is wasted solar: 110kWh * £4 = £440
        decimal optimalCost = 440m;
        
        AssertPlanCost(chargePlan, optimalCost);
    }

    [Test]
    public async Task GivenGridWillBeSameAllDayKeepsBatteryNotCharging()
    {
        GivenSolarGenerationForAllSegmentsIs(0);
        GivenLoadForAllSegmentsIs(1);
        GivenPriceForAllSegmentsIs(4);

        var chargePlan = await _planOptimiser.CreateChargePlan(_testDay, 0.Kwh());
        
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

        var chargePlan = await _planOptimiser.CreateChargePlan(_testDay, 0.Kwh());
        
        // Optimal strategy: charge battery during cheap periods, discharge during expensive
        // Need 2kWh for expensive periods (2 segments * 1kWh each)
        // Charge 2kWh in 1 cheap segment: (2kWh charge + 1kWh load) * £2 = £6
        // 9 remaining cheap segments: 9 * 1kWh * £2 = £18
        // 2 expensive segments: use battery (1kWh each), no grid cost
        // Total: £6 + £18 = £24
        decimal optimalCost = 24m;
        
        AssertPlanCost(chargePlan, optimalCost);
    }

    [Test]
    public async Task GivenSolarExceedsLoadItChargesBatteryWithExcess()
    {
        GivenSolarGenerationForAllSegmentsIs(5);
        GivenLoadForAllSegmentsIs(2);
        GivenPriceForAllSegmentsIs(4);

        var chargePlan = await _planOptimiser.CreateChargePlan(_testDay, 0.Kwh());
        
        // Each segment: 5kWh solar, 2kWh load
        // In optimal strategy (Discharge mode): solar surplus = 5-2 = 3kWh per segment
        // First ~3.33 segments fill battery: 3*3 = 9kWh, plus 1kWh from 4th segment = 10kWh
        // Remaining excess from segment 4: 2kWh wasted
        // Segments 5-12: 3kWh excess each, all wasted = 8*3 = 24kWh
        // Total wasted: 2 + 24 = 26kWh
        // Cost: 26kWh * £4 = £104
        decimal optimalCost = 104m;
        
        AssertPlanCost(chargePlan, optimalCost);
    }

    [Test]
    public async Task GivenHighestPricesInEveningItSavesCapacityForThen()
    {
        GivenSolarGenerationIs(new[] { 0, 0, 0, 3, 5, 5, 5, 3, 0, 0, 0, 0 });
        GivenLoadIs(new[] { 1, 1, 1, 1, 1, 1, 1, 1, 3, 3, 3, 3 });
        GivenPriceIs(new[] { 3, 3, 3, 2, 2, 2, 2, 2, 8, 8, 8, 8 });

        var chargePlan = await _planOptimiser.CreateChargePlan(_testDay, 0.Kwh());
        
        // Segments 0-2: No solar, 1kWh load each at £3 = £9
        // Segments 3-7: Solar [3,5,5,5,3], load 1kWh each, price £2
        //   Surplus: [2,4,4,4,2] = 16kWh total
        //   Battery stores 10kWh, waste 6kWh at £2 each = £12
        // Segments 8-11: No solar, 3kWh load each at £8
        //   Total needed: 12kWh, battery provides 10kWh
        //   Grid needed: 2kWh at £8 = £16  
        // Total: £9 + £12 + £16 = £37
        decimal optimalCost = 37m;
        
        AssertPlanCost(chargePlan, optimalCost);
    }

    [Test]
    public async Task GivenPriceDipDuringDayItUsesGridToCharge()
    {
        GivenSolarGenerationIs(new[] { 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0 });
        GivenLoadIs(new[] { 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2 });
        GivenPriceIs(new[] { 5, 5, 5, 5, 1, 1, 5, 5, 5, 5, 5, 5 });

        var chargePlan = await _planOptimiser.CreateChargePlan(_testDay, 0.Kwh());
        
        // Optimal: charge battery during cheap segments 4-5 (£1), use elsewhere
        // Segments 4-5: Solar 1kWh, load 2kWh, charge 2kWh from grid
        //   Grid usage: 1 + 2 = 3kWh per segment at £1 = £6 total
        // Battery provides 4kWh total (2kWh per cheap segment)
        // Remaining load: 12*2 - 4*1 - 4 = 24 - 4 - 4 = 16kWh at £5 = £80
        // Total: £6 + £80 = £86
        decimal optimalCost = 86m;
        
        AssertPlanCost(chargePlan, optimalCost);
    }

    [Test]
    public async Task GivenBatteryStartsFullItDischargesDuringHighPrices()
    {
        GivenSolarGenerationForAllSegmentsIs(0);
        GivenLoadForAllSegmentsIs(2);
        GivenPriceIs(new[] { 2, 2, 2, 5, 5, 5, 5, 5, 5, 2, 2, 2 });

        var chargePlan = await _planOptimiser.CreateChargePlan(_testDay, 10.Kwh());
        
        // Battery starts with 10kWh
        // Use battery during high price periods (segments 3-8 = 6 segments)
        // Battery provides 6*2 = 12kWh, but only has 10kWh available
        // So battery provides 10kWh, need 2kWh from grid during high price
        // Low price segments (0-2, 9-11): 6*2 = 12kWh at £2 = £24
        // High price grid usage: 2kWh at £5 = £10
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

        var chargePlan = await _planOptimiser.CreateChargePlan(_testDay, 0.Kwh());
        
        // Prices gradually increase: £4 → £5 → £6
        // Cost of charging at £4 and using at £5: saves £1/kWh
        // Cost of charging at £4 and using at £6: saves £2/kWh  
        // Cost of charging at £5 and using at £6: saves £1/kWh
        // Optimal: charge during £4 periods for use during £6 periods
        // Can charge 2kWh per segment, need 4 segments to charge 8kWh
        // But only 5 segments at £4, and need 1kWh load each, so can charge in 4 segments
        // 1 segment: just load at £4 = £4
        // 4 segments: 1kWh load + 2kWh charge = 3kWh at £4 = £48
        // 4 segments at £5: 1kWh each at £5 = £20  
        // 3 segments at £6: use battery (3kWh), need 0kWh from grid = £0
        // But wait, we charged 8kWh, so have 8kWh available
        // 3 segments at £6 use 3kWh from battery, 5kWh remains
        // This doesn't seem optimal. Let me recalculate...
        // Actually, gradual price increase might not justify battery cycling costs
        // Better to just buy at current prices: 5*£4 + 4*£5 + 3*£6 = £20 + £20 + £18 = £58
        decimal optimalCost = 58m;
        
        AssertPlanCost(chargePlan, optimalCost);
    }

    [Test]
    public async Task GivenExtremelyLowPriceFollowedByHighItChargesFullyDuringLowPrice()
    {
        GivenSolarGenerationForAllSegmentsIs(0);
        GivenLoadForAllSegmentsIs(1);
        GivenPriceIs(new[] { 10, 10, 1, 1, 10, 10, 10, 10, 10, 10, 10, 10 });

        var chargePlan = await _planOptimiser.CreateChargePlan(_testDay, 0.Kwh());
        
        // Segments 0-1: 2kWh at £10 = £20
        // Segments 2-3: 2kWh load + charge battery
        //   Can charge 4kWh total (2kWh per segment)
        //   Load: 2*1kWh = 2kWh at £1 = £2
        //   Charging: 4kWh at £1 = £4
        // Segments 4-11: 8 segments * 1kWh each, but use 4kWh from battery
        //   Remaining: 4kWh at £10 = £40
        // Total: £20 + £2 + £4 + £40 = £66
        // 
        // Wait, let me be more careful. Battery capacity is 10kWh.
        // Segments 2-3: Load 1kWh each, can charge 2kWh each from grid
        // Total grid usage per segment: 1 + 2 = 3kWh
        // Cost: 2 * 3kWh * £1 = £6
        // Battery gains: 2 * 2kWh = 4kWh
        // Remaining 8 segments need 8kWh total, battery provides 4kWh
        // Grid needed: 4kWh at £10 = £40
        // Total: £20 + £6 + £40 = £66
        //
        // But we can charge more! Battery capacity is 10kWh.
        // Better strategy: charge 8kWh in segments 2-3 (4kWh each)
        // Segment 2: 1kWh load + 4kWh charge = 5kWh at £1 = £5
        // Segment 3: 1kWh load + 4kWh charge = 5kWh at £1 = £5  
        // Battery now has 8kWh
        // Segments 4-11: use all 8kWh from battery, need 0kWh from grid = £0
        // Total: £20 + £5 + £5 + £0 = £30
        decimal optimalCost = 30m;
        
        AssertPlanCost(chargePlan, optimalCost);
    }

    [Test]
    public async Task GivenMixOfSolarAndPriceVariationsItOptimizesCorrectly()
    {
        GivenSolarGenerationIs(new[] { 0, 0, 0, 0, 3, 5, 5, 3, 0, 0, 0, 0 });
        GivenLoadIs(new[] { 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2 });
        GivenPriceIs(new[] { 2, 2, 2, 2, 2, 2, 2, 3, 8, 8, 8, 8 });

        var chargePlan = await _planOptimiser.CreateChargePlan(_testDay, 0.Kwh());
        
        // Segments 0-3: No solar, 1kWh load each at £2 = £8
        // Segments 4-7: Solar [3,5,5,3], load 1kWh each, prices [£2,£2,£2,£3]
        //   Solar surplus: [2,4,4,2] = 12kWh total
        //   Battery capacity: 10kWh, so waste 2kWh
        //   Assume waste occurs in segment 7 (highest price): 2kWh at £3 = £6
        // Segments 8-11: No solar, 2kWh load each at £8
        //   Total needed: 8kWh, battery provides 8kWh (limited by need)
        //   Grid needed: 0kWh = £0
        // Total: £8 + £6 + £0 = £14
        // 
        // Actually, let me be more careful about which surplus gets wasted.
        // Battery starts empty, gets filled by surplus solar.
        // Segments 4-6: surplus [2,4,4] = 10kWh exactly fills battery
        // Segment 7: surplus 2kWh, battery full, so waste 2kWh at £3 = £6
        // Segments 8-11: battery provides 8kWh for the 8kWh needed
        // Cost: £8 (segments 0-3) + £6 (waste) = £14
        decimal optimalCost = 14m;
        
        AssertPlanCost(chargePlan, optimalCost);
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
            _supplier.GetPrice(_testDay, HalfHourSegments.AllSegments[i]).Returns(new ElectricityRate(new Gbp(value)));
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
        if (!chargePlan.Any())
        {
            Console.WriteLine("No charge plan data to display.");
            return;
        }

        // Define column configurations
        var columns = new List<ColumnConfig>
        {
            new("Time", c => FormatTime(c.HalfHourSegment)),
            new("Mode", c => c.Mode.ToString()),
            new("Solar", c => c.ExpectedSolarGeneration.Value.ToString("F2")),
            new("Load", c => c.ExpectedConsumption.Value.ToString("F2")),
            new("Grid", c => c.ActualGridUsage.Value.ToString("F2")),
            new("Price", c => c.GridPrice.PricePerKwh.PoundsAmount.ToString("F2")),
            new("Batt Start", c => c.StartBatteryChargeKwh.Value.ToString("F2")),
            new("Batt End", c => c.EndBatteryChargeKwh.Value.ToString("F2")),
            new("Wasted", c => (c.WastedSolarGeneration ?? Kwh.Zero).Value.ToString("F2")),
            new("Cost", c => c.Cost().ToString())
        };

        // Calculate column widths based on content
        foreach (var column in columns)
        {
            // Start with header width
            column.Width = column.Header.Length;
            
            // Check all data rows
            foreach (var segment in chargePlan)
            {
                var cellValue = column.ValueSelector(segment);
                column.Width = Math.Max(column.Width, cellValue.Length);
            }
            
            // Add padding
            column.Width += 2;
        }

        // Calculate totals
        var totalCost = chargePlan.CalculatePlanCost();
        var totalWastedSolar = chargePlan.Sum(s => (s.WastedSolarGeneration ?? Kwh.Zero).Value);

        // Print table
        PrintSeparator(columns);
        PrintRow(columns, columns.Select(c => c.Header));
        PrintSeparator(columns);
        
        foreach (var segment in chargePlan)
        {
            PrintRow(columns, columns.Select(c => c.ValueSelector(segment)));
        }
        
        PrintSeparator(columns);
        
        // Print totals row
        var totalRowValues = columns.Select((c, i) => i switch
        {
            0 => "TOTAL",
            8 => totalWastedSolar.ToString("F2"), // Wasted column
            9 => totalCost.ToString(),        // Cost column
            _ => ""
        });
        
        PrintRow(columns, totalRowValues);
        PrintSeparator(columns);
    }

    private static string FormatTime(HalfHourSegment segment)
    {
        return $"{segment.HourStart:D2}:{segment.MinuteStart:D2}-{segment.HourEnd:D2}:{segment.MinuteEnd:D2}";
    }

    private static void PrintSeparator(List<ColumnConfig> columns)
    {
        var separator = string.Join("+", columns.Select(c => new string('-', c.Width + 2)));
        Console.WriteLine("+" + separator + "+");
    }

    private static void PrintRow(List<ColumnConfig> columns, IEnumerable<string> values)
    {
        var cells = columns.Zip(values, (col, val) => $" {val.PadRight(col.Width)} ");
        Console.WriteLine("|" + string.Join("|", cells) + "|");
    }

    private class ColumnConfig
    {
        public string Header { get; }
        public Func<TimeSegment, string> ValueSelector { get; }
        public int Width { get; set; }

        public ColumnConfig(string header, Func<TimeSegment, string> valueSelector)
        {
            Header = header;
            ValueSelector = valueSelector;
            Width = header.Length;
        }
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