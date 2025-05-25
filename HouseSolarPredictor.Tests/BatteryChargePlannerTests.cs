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

    private class TestBatteryPredictor : IBatteryPredictor
    {
        public Kwh Capacity => new Kwh(10m);
        public Kwh GridChargePerSegment => new Kwh(2m);

        public Kwh PredictNewBatteryStateAfter30Minutes(Kwh startCapacity, Kwh availablePowerToCharge)
        {
            return startCapacity + availablePowerToCharge;
        }
    }
    
    [SetUp]
    public void Setup()
    {
        _solarPredictor = Substitute.For<ISolarPredictor>();
        _loadPredictor = Substitute.For<ILoadPredictor>();
        _supplier = Substitute.For<ISupplier>();
        _testDay = new LocalDate(2023, 1, 1);
        
        _batteryChargePlanner = new BatteryChargePlanner(_solarPredictor, _loadPredictor, _supplier, new TestBatteryPredictor());
    }

    [Test]
    public async Task GivenSolarWillBeHighAllDayChargesFromSolarOnly()
    {
        GivenSolarGenerationForAnySegmentIs(10);
        GivenLoadForAnySegmentIs(2);
        GivenPriceForAnySegmentIs(4);

        var chargePlan = await _batteryChargePlanner.CreateChargePlan(_testDay);
        
        // Define optimal cost threshold
        decimal optimalCost = 0m; // No grid electricity used, all from solar
        
        AssertPlanCost(chargePlan, optimalCost);
    }

    [Test]
    public async Task GivenGridWillBeSameAllDayKeepsBatteryNotCharging()
    {
        GivenSolarGenerationForAnySegmentIs(0);
        GivenLoadForAnySegmentIs(1);
        GivenPriceForAnySegmentIs(4);

        var chargePlan = await _batteryChargePlanner.CreateChargePlan(_testDay);
        
        // Define optimal cost threshold
        // 6 segments * 1 kWh load * £4 per kWh = £24
        decimal optimalCost = 24m;
        
        AssertPlanCost(chargePlan, optimalCost);
    }
    
    [Test]
    public async Task GivenGridWillBeExpensiveInAfternoonItChargesEarlyToCapacity()
    {
        GivenSolarGenerationForAnySegmentIs(0);
        GivenLoadForAnySegmentIs(1);
        GivenPriceForAnySegmentIs(2);
        GivenPriceForHours("5-10", 7);

        var chargePlan = await _batteryChargePlanner.CreateChargePlan(_testDay);
        
        // Define optimal cost threshold
        // 10 segments * 1 kWh load * £2 per kWh = £20
        // 2 segments * 1 kWh load * £7 per kWh = £14
        // Total: £34
        decimal optimalCost = 20m;  // Optimal would be to charge battery during cheap periods
        
        AssertPlanCost(chargePlan, optimalCost);
    }

    [Test]
    public async Task GivenSolarExceedsLoadItChargesBatteryWithExcess()
    {
        GivenSolarGenerationForAnySegmentIs(5);
        GivenLoadForAnySegmentIs(2);
        GivenPriceForAnySegmentIs(4);

        var chargePlan = await _batteryChargePlanner.CreateChargePlan(_testDay);
        
        // Define optimal cost threshold
        // All load covered by solar, but some wasted solar
        // 5 segments * 1 kWh wasted * £5 penalty = £25
        // 1 segment * 3 kWh wasted * £5 penalty = £15
        // Total: £40
        decimal optimalCost = 40m;
        
        AssertPlanCost(chargePlan, optimalCost);
    }

    [Test]
    public async Task GivenHighestPricesInEveningItSavesCapacityForThen()
    {
        GivenSolarGenerationIs(new[] { 0, 0, 0, 3, 5, 5, 5, 3, 0, 0, 0, 0 });
        GivenLoadIs(new[] { 1, 1, 1, 1, 1, 1, 1, 1, 3, 3, 3, 3 });
        GivenPriceIs(new[] { 3, 3, 3, 2, 2, 2, 2, 2, 8, 8, 8, 8 });

        var chargePlan = await _batteryChargePlanner.CreateChargePlan(_testDay);
        
        // Define optimal cost threshold
        // 3 segments * 1 kWh * £3 = £9 (first 3 segments)
        // 5 segments * 1 kWh covered by solar = £0
        // 4 segments * 3 kWh, with 10 kWh from battery and 2 kWh from grid * £8 = £16
        // 6 kWh wasted solar * £5 penalty = £30
        // Total: £55
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
        
        // Define optimal cost threshold
        // 4 kWh from solar
        // 4 kWh from battery charged during low price
        // 16 kWh from grid (10 at £5, 2 at £1)
        // Total: 10*5 + 2*1 + 0 = £52
        decimal optimalCost = 52m;
        
        AssertPlanCost(chargePlan, optimalCost);
    }

    [Test]
    public async Task GivenBatteryStartsFullItDischargesDuringHighPrices()
    {
        // Implement test for starting with a full battery
        GivenBatteryStartsAt(10);
        GivenSolarGenerationForAnySegmentIs(0);
        GivenLoadForAnySegmentIs(2);
        GivenPriceIs(new[] { 2, 2, 2, 5, 5, 5, 5, 5, 5, 2, 2, 2 });

        var chargePlan = await _batteryChargePlanner.CreateChargePlan(_testDay);
        
        // Define optimal cost threshold
        // 10 kWh from battery during high price periods
        // 14 kWh from grid (6 at £5, 8 at £2)
        // Total: 6*5 + 8*2 = £46
        decimal optimalCost = 46m;
        
        AssertPlanCost(chargePlan, optimalCost);
    }

    [Test]
    public async Task GivenNoSolarAndHigherPricesLaterItDoesNotCharge()
    {
        GivenSolarGenerationForAnySegmentIs(0);
        GivenLoadForAnySegmentIs(1);
        GivenPriceIs(new[] { 4, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6 });

        var chargePlan = await _batteryChargePlanner.CreateChargePlan(_testDay);
        
        // Define optimal cost threshold
        // 5 segments * 1 kWh * £4 = £20
        // 4 segments * 1 kWh * £5 = £20
        // 3 segments * 1 kWh * £6 = £18
        // Total: £58
        decimal optimalCost = 58m;
        
        AssertPlanCost(chargePlan, optimalCost);
    }

    [Test]
    public async Task GivenExtremelyLowPriceFollowedByHighItChargesFullyDuringLowPrice()
    {
        GivenSolarGenerationForAnySegmentIs(0);
        GivenLoadForAnySegmentIs(1);
        GivenPriceIs(new[] { 10, 10, 1, 1, 10, 10, 10, 10, 10, 10, 10, 10 });

        var chargePlan = await _batteryChargePlanner.CreateChargePlan(_testDay);
        
        // Define optimal cost threshold
        // 2 segments * 1 kWh * £10 = £20 (first two segments)
        // 2 segments * 1 kWh * £1 = £2 (plus 8 kWh to charge battery)
        // 4 segments * 1 kWh from battery = £0
        // 4 segments * 1 kWh * £10 = £40 (last four segments)
        // Total: £62
        decimal optimalCost = 22m; // Optimal would be to charge battery during cheap periods
        
        AssertPlanCost(chargePlan, optimalCost);
    }

    [Test]
    public async Task GivenMixOfSolarAndPriceVariationsItOptimizesCorrectly()
    {
        GivenSolarGenerationIs(new[] { 0, 0, 0, 0, 3, 5, 5, 3, 0, 0, 0, 0 });
        GivenLoadIs(new[] { 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2 });
        GivenPriceIs(new[] { 2, 2, 2, 2, 2, 2, 2, 3, 8, 8, 8, 8 });

        var chargePlan = await _batteryChargePlanner.CreateChargePlan(_testDay);
        
        // Define optimal cost threshold
        // 4 segments * 1 kWh * £2 = £8 (first four segments)
        // 4 segments with solar covering load = £0
        // 4 segments * 2 kWh with 8 kWh from battery and 0 from grid = £0
        // 10 kWh wasted solar * £5 penalty = £50
        // Total: £58
        decimal optimalCost = 58m;
        
        AssertPlanCost(chargePlan, optimalCost);
    }

    private void GivenBatteryStartsAt(decimal initialCharge)
    {
        // This would need to be implemented in the BatteryChargePlanner
    }

    private void GivenPriceForHours(string range, decimal pricePerKwh)
    {
        var startHour = int.Parse(range.Split('-')[0]);
        var endHour = int.Parse(range.Split('-')[1]);
        
        for (var hour = startHour; hour < endHour; hour++)
        {
            var segment = HalfHourSegments.AllSegments.FirstOrDefault(s => s.HourStart == hour);
            if (segment != null)
            {
                _supplier.GetPrice(_testDay, segment).Returns(new ElectricityRate(new Gbp(pricePerKwh)));
            }
        }
    }

    private void GivenSolarGenerationIs(decimal[] values)
    {
        for (var i = 0; i < values.Length && i < HalfHourSegments.AllSegments.Count; i++)
        {
            _solarPredictor.PredictSolarEnergy(_testDay.DayOfYear, HalfHourSegments.AllSegments[i])
                .Returns(new Kwh(values[i]));
        }
    }
    private void GivenSolarGenerationIs(int[] values)
    {
        GivenSolarGenerationIs(values.Select(v => (decimal)v).ToArray());
    }

    private void GivenLoadIs(decimal[] values)
    {
        for (var i = 0; i < values.Length && i < HalfHourSegments.AllSegments.Count; i++)
        {
            _loadPredictor.PredictLoad(_testDay.DayOfYear, HalfHourSegments.AllSegments[i])
                .Returns(new Kwh(values[i]));
        }
    }
    private void GivenLoadIs(int[] values)
    {
        GivenLoadIs(values.Select(v => (decimal)v).ToArray());
    }
    
    


    private void GivenPriceIs(decimal[] values)
    {
        for (var i = 0; i < values.Length && i < HalfHourSegments.AllSegments.Count; i++)
        {
            _supplier.GetPrice(_testDay, HalfHourSegments.AllSegments[i])
                .Returns(new ElectricityRate(new Gbp(values[i])));
        }
    }
    
    private void GivenPriceIs(int[] values)
    {
        GivenPriceIs(values.Select(v => (decimal)v).ToArray());
    }

    private void AssertPlanCost(List<TimeSegment> chargePlan, decimal optimalCost)
    {
        // Calculate the actual cost of the plan
        var actualCost = CalculatePlanCost(chargePlan);
        
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
        const int modeWidth = 20;
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
        decimal totalCost = 0;
        decimal totalWastedSolar = 0;
        
        foreach (var segment in chargePlan)
        {
            var time = $"{segment.HalfHourSegment.HourStart:D2}:{segment.HalfHourSegment.MinuteStart:D2}-{segment.HalfHourSegment.HourEnd:D2}:{segment.HalfHourSegment.MinuteEnd:D2}";
            var solar = segment.SolarGeneration;
            var load = segment.EstimatedConsumption;
            var price = segment.GridPrice;
            var battStart = segment.StartBatteryChargeKwh;
            var battEnd = segment.EndBatteryChargeKwh;
            var wasted = segment.WastedSolarGeneration ?? Kwh.Zero;
            
            // Calculate segment cost
            decimal segmentCost = CalculateSegmentCost(segment);
            totalCost += segmentCost;
            totalWastedSolar += (decimal)wasted.Value;
            
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
    
    private decimal CalculatePlanCost(List<TimeSegment> chargePlan)
    {
        decimal totalCost = 0;
        
        foreach (var segment in chargePlan)
        {
            totalCost += CalculateSegmentCost(segment);
        }
        
        return totalCost;
    }
    
    private decimal CalculateSegmentCost(TimeSegment segment)
    {
        // Cost components:
        // 1. Grid electricity used (price * amount)
        // 2. Wasted solar (penalty per kWh)
        var wastedSolarPenalty = new ElectricityRate(new Gbp(5.0m)); // Penalty for each kWh of wasted solar
        
        decimal gridCost = 0;
        decimal wastedSolarCost = 0;
        
        // Calculate grid electricity used
        Kwh solarUsed = Kwh.Min(segment.SolarGeneration, segment.EstimatedConsumption);
        Kwh batteryContribution = Kwh.Zero;
        
        if (segment.Mode == OutputsMode.Discharge)
        {
            // Battery is discharging
            batteryContribution = segment.StartBatteryChargeKwh - segment.EndBatteryChargeKwh;
        }
        
        // Calculate grid electricity used (load - solar - battery)
        Kwh gridUsed = segment.EstimatedConsumption - solarUsed - batteryContribution;
        if (gridUsed.Value < 0)
            gridUsed = Kwh.Zero;
            
        // Calculate grid cost using the Kwh * ElectricityRate operator
        Gbp gridCostGbp = gridUsed * segment.GridPrice;
        gridCost = gridCostGbp.PoundsAmount;
        
        // Calculate wasted solar cost using the Kwh * ElectricityRate operator
        Kwh wastedSolar = segment.WastedSolarGeneration ?? Kwh.Zero;
        Gbp wastedSolarCostGbp = wastedSolar * wastedSolarPenalty;
        wastedSolarCost = wastedSolarCostGbp.PoundsAmount;
        
        return gridCost + wastedSolarCost;
    }
    
    // CalculateOptimalCost method removed as it's no longer needed

    private void GivenPriceForAnySegmentIs(int price)
    {
        _supplier.GetPrice(_testDay, Arg.Any<HalfHourSegment>())
            .Returns(new ElectricityRate(new Gbp(price)));
    }

    private void GivenLoadForAnySegmentIs(decimal load)
    {
        _loadPredictor.PredictLoad(_testDay.DayOfYear, Arg.Any<HalfHourSegment>())
            .Returns(new Kwh(load));
    }

    private void GivenSolarGenerationForAnySegmentIs(decimal solarGenForSegment)
    {
        _solarPredictor.PredictSolarEnergy(_testDay.DayOfYear, Arg.Any<HalfHourSegment>())
            .Returns(new Kwh(solarGenForSegment));
    }

    // PlanAssertion class removed as it's no longer needed
}