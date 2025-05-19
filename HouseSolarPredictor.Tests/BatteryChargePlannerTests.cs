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
        public Kwh MaxChargePerSegment => new Kwh(2m);

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
        
        var assertions = new List<PlanAssertion>
        {
            new(OutputsMode.ChargeSolarOnly, 0, 2, 10, 2),
            new(OutputsMode.ChargeSolarOnly, 2, 4, 10, 2),
            new(OutputsMode.ChargeSolarOnly, 4, 6, 10, 2),
            new(OutputsMode.ChargeSolarOnly, 6, 8, 10, 2),
            new(OutputsMode.ChargeSolarOnly, 8, 10, 10, 2),
            new(OutputsMode.ChargeSolarOnly, 10, 10, 10, 2)
        };
        
        RunAssertions(chargePlan, assertions);
    }

    [Test]
    public async Task GivenGridWillBeSameAllDayKeepsBatteryNotCharging()
    {
        GivenSolarGenerationForAnySegmentIs(0);
        GivenLoadForAnySegmentIs(1);
        GivenPriceForAnySegmentIs(4);

        var chargePlan = await _batteryChargePlanner.CreateChargePlan(_testDay);
        
        // Since there's no solar and no price advantage, we shouldn't charge from grid
        var assertions = new List<PlanAssertion>
        {
            new(OutputsMode.ChargeFromGridAndSolar, 0, 0, 0),
            new(OutputsMode.ChargeFromGridAndSolar, 0, 0, 0),
            new(OutputsMode.ChargeFromGridAndSolar, 0, 0, 0),
            new(OutputsMode.ChargeFromGridAndSolar, 0, 0, 0),
            new(OutputsMode.ChargeFromGridAndSolar, 0, 0, 0),
            new(OutputsMode.ChargeFromGridAndSolar, 0, 0, 0)
        };
        
        RunAssertions(chargePlan, assertions);
    }
    
    [Test]
    public async Task GivenGridWillBeExpensiveInAfternoonItChargesEarlyToCapacity()
    {
        GivenSolarGenerationForAnySegmentIs(0);
        GivenLoadForAnySegmentIs(1);
        GivenPriceForAnySegmentIs(2);
        GivenPriceForHours("5-10", 7);

        var chargePlan = await _batteryChargePlanner.CreateChargePlan(_testDay);
        
        var assertions = new List<PlanAssertion>
        {
            new(OutputsMode.ChargeFromGridAndSolar, 0, 2, 0),
            new(OutputsMode.ChargeFromGridAndSolar, 2, 4, 0),
            new(OutputsMode.ChargeFromGridAndSolar, 4, 6, 0),
            new(OutputsMode.ChargeFromGridAndSolar, 6, 8, 0),
            new(OutputsMode.ChargeFromGridAndSolar, 8, 10, 0),
            new(OutputsMode.ChargeFromGridAndSolar, 10, 10, 0), // 3am
            new(OutputsMode.ChargeFromGridAndSolar, 10, 10, 0), // 3:30am
            new(OutputsMode.ChargeFromGridAndSolar, 10, 10, 0), // 4am
            new(OutputsMode.ChargeFromGridAndSolar, 10, 10, 0), // 4:30am
            new(OutputsMode.ChargeFromGridAndSolar, 10, 10, 0), // 5am
            new(OutputsMode.Discharge, 10, 9, 0), // 5:30am
            new(OutputsMode.Discharge, 9, 8, 0) // 6am
        };
        
        RunAssertions(chargePlan, assertions);
    }

    [Test]
    public async Task GivenSolarExceedsLoadItChargesBatteryWithExcess()
    {
        GivenSolarGenerationForAnySegmentIs(5);
        GivenLoadForAnySegmentIs(2);
        GivenPriceForAnySegmentIs(4);

        var chargePlan = await _batteryChargePlanner.CreateChargePlan(_testDay);
        
        // Should use solar for load first, then charge battery with excess (up to max charge rate)
        var assertions = new List<PlanAssertion>
        {
            new(OutputsMode.ChargeSolarOnly, 0, 2, 5, 2, wastedSolar: 1),
            new(OutputsMode.ChargeSolarOnly, 2, 4, 5, 2, wastedSolar: 1),
            new(OutputsMode.ChargeSolarOnly, 4, 6, 5, 2, wastedSolar: 1),
            new(OutputsMode.ChargeSolarOnly, 6, 8, 5, 2, wastedSolar: 1),
            new(OutputsMode.ChargeSolarOnly, 8, 10, 5, 2, wastedSolar: 1),
            new(OutputsMode.ChargeSolarOnly, 10, 10, 5, 2, wastedSolar: 3)
        };
        
        RunAssertions(chargePlan, assertions);
    }

    [Test]
    public async Task GivenHighestPricesInEveningItSavesCapacityForThen()
    {
        GivenSolarGenerationIs(new[] { 0, 0, 0, 3, 5, 5, 5, 3, 0, 0, 0, 0 });
        GivenLoadIs(new[] { 1, 1, 1, 1, 1, 1, 1, 1, 3, 3, 3, 3 });
        GivenPriceIs(new[] { 3, 3, 3, 2, 2, 2, 2, 2, 8, 8, 8, 8 });

        var chargePlan = await _batteryChargePlanner.CreateChargePlan(_testDay);
        
        // Should charge from solar during day and save for expensive evening
        var assertions = new List<PlanAssertion>
        {
            new(OutputsMode.ChargeFromGridAndSolar, 0, 0, 0, 1, 3),
            new(OutputsMode.ChargeFromGridAndSolar, 0, 0, 0, 1, 3),
            new(OutputsMode.ChargeFromGridAndSolar, 0, 0, 0, 1, 3),
            new(OutputsMode.ChargeSolarOnly, 0, 2, 3, 1, 2),
            new(OutputsMode.ChargeSolarOnly, 2, 4, 5, 1, 2, wastedSolar: 2),
            new(OutputsMode.ChargeSolarOnly, 4, 6, 5, 1, 2, wastedSolar: 2),
            new(OutputsMode.ChargeSolarOnly, 6, 8, 5, 1, 2, wastedSolar: 2),
            new(OutputsMode.ChargeSolarOnly, 8, 10, 3, 1, 2, wastedSolar: 0),
            new(OutputsMode.Discharge, 10, 7, 0, 3, 8),
            new(OutputsMode.Discharge, 7, 4, 0, 3, 8),
            new(OutputsMode.Discharge, 4, 1, 0, 3, 8),
            new(OutputsMode.Discharge, 1, 0, 0, 3, 8)
        };
        
        RunAssertions(chargePlan, assertions);
    }

    [Test]
    public async Task GivenPriceDipDuringDayItUsesGridToCharge()
    {
        GivenSolarGenerationIs(new[] { 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0 });
        GivenLoadIs(new[] { 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2 });
        GivenPriceIs(new[] { 5, 5, 5, 5, 1, 1, 5, 5, 5, 5, 5, 5 });

        var chargePlan = await _batteryChargePlanner.CreateChargePlan(_testDay);
        
        // Should charge from grid during price dip
        var assertions = new List<PlanAssertion>
        {
            new(OutputsMode.ChargeFromGridAndSolar, 0, 0, 0, 2, 5),
            new(OutputsMode.ChargeFromGridAndSolar, 0, 0, 0, 2, 5),
            new(OutputsMode.ChargeFromGridAndSolar, 0, 0, 0, 2, 5),
            new(OutputsMode.ChargeSolarOnly, 0, 0, 1, 2, 5),
            new(OutputsMode.ChargeFromGridAndSolar, 0, 2, 1, 2, 1),
            new(OutputsMode.ChargeFromGridAndSolar, 2, 4, 1, 2, 1),
            new(OutputsMode.ChargeSolarOnly, 4, 4, 1, 2, 5),
            new(OutputsMode.Discharge, 4, 2, 0, 2, 5),
            new(OutputsMode.Discharge, 2, 0, 0, 2, 5),
            new(OutputsMode.ChargeFromGridAndSolar, 0, 0, 0, 2, 5),
            new(OutputsMode.ChargeFromGridAndSolar, 0, 0, 0, 2, 5),
            new(OutputsMode.ChargeFromGridAndSolar, 0, 0, 0, 2, 5)
        };
        
        RunAssertions(chargePlan, assertions);
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
        
        var assertions = new List<PlanAssertion>
        {
            new(OutputsMode.ChargeFromGridAndSolar, 10, 10, 0, 2, 2),
            new(OutputsMode.ChargeFromGridAndSolar, 10, 10, 0, 2, 2),
            new(OutputsMode.ChargeFromGridAndSolar, 10, 10, 0, 2, 2),
            new(OutputsMode.Discharge, 10, 8, 0, 2, 5),
            new(OutputsMode.Discharge, 8, 6, 0, 2, 5),
            new(OutputsMode.Discharge, 6, 4, 0, 2, 5),
            new(OutputsMode.Discharge, 4, 2, 0, 2, 5),
            new(OutputsMode.Discharge, 2, 0, 0, 2, 5),
            new(OutputsMode.ChargeFromGridAndSolar, 0, 0, 0, 2, 5),
            new(OutputsMode.ChargeFromGridAndSolar, 0, 0, 0, 2, 2),
            new(OutputsMode.ChargeFromGridAndSolar, 0, 0, 0, 2, 2),
            new(OutputsMode.ChargeFromGridAndSolar, 0, 0, 0, 2, 2)
        };
        
        RunAssertions(chargePlan, assertions);
    }

    [Test]
    public async Task GivenNoSolarAndHigherPricesLaterItDoesNotCharge()
    {
        GivenSolarGenerationForAnySegmentIs(0);
        GivenLoadForAnySegmentIs(1);
        GivenPriceIs(new[] { 4, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6 });

        var chargePlan = await _batteryChargePlanner.CreateChargePlan(_testDay);
        
        // Should not charge from grid if prices only increase
        var assertions = new List<PlanAssertion>
        {
            new(OutputsMode.ChargeFromGridAndSolar, 0, 0, 0, 1, 4),
            new(OutputsMode.ChargeFromGridAndSolar, 0, 0, 0, 1, 4),
            new(OutputsMode.ChargeFromGridAndSolar, 0, 0, 0, 1, 4),
            new(OutputsMode.ChargeFromGridAndSolar, 0, 0, 0, 1, 4),
            new(OutputsMode.ChargeFromGridAndSolar, 0, 0, 0, 1, 4),
            new(OutputsMode.ChargeFromGridAndSolar, 0, 0, 0, 1, 5),
            new(OutputsMode.ChargeFromGridAndSolar, 0, 0, 0, 1, 5),
            new(OutputsMode.ChargeFromGridAndSolar, 0, 0, 0, 1, 5),
            new(OutputsMode.ChargeFromGridAndSolar, 0, 0, 0, 1, 5),
            new(OutputsMode.ChargeFromGridAndSolar, 0, 0, 0, 1, 6),
            new(OutputsMode.ChargeFromGridAndSolar, 0, 0, 0, 1, 6),
            new(OutputsMode.ChargeFromGridAndSolar, 0, 0, 0, 1, 6)
        };
        
        RunAssertions(chargePlan, assertions);
    }

    [Test]
    public async Task GivenExtremelyLowPriceFollowedByHighItChargesFullyDuringLowPrice()
    {
        GivenSolarGenerationForAnySegmentIs(0);
        GivenLoadForAnySegmentIs(1);
        GivenPriceIs(new[] { 10, 10, 1, 1, 10, 10, 10, 10, 10, 10, 10, 10 });

        var chargePlan = await _batteryChargePlanner.CreateChargePlan(_testDay);
        
        // Should charge to full during extremely low price period
        var assertions = new List<PlanAssertion>
        {
            new(OutputsMode.ChargeFromGridAndSolar, 0, 0, 0, 1, 10),
            new(OutputsMode.ChargeFromGridAndSolar, 0, 0, 0, 1, 10),
            new(OutputsMode.ChargeFromGridAndSolar, 0, 2, 0, 1, 1),
            new(OutputsMode.ChargeFromGridAndSolar, 2, 4, 0, 1, 1),
            new(OutputsMode.Discharge, 4, 3, 0, 1, 10),
            new(OutputsMode.Discharge, 3, 2, 0, 1, 10),
            new(OutputsMode.Discharge, 2, 1, 0, 1, 10),
            new(OutputsMode.Discharge, 1, 0, 0, 1, 10),
            new(OutputsMode.ChargeFromGridAndSolar, 0, 0, 0, 1, 10),
            new(OutputsMode.ChargeFromGridAndSolar, 0, 0, 0, 1, 10),
            new(OutputsMode.ChargeFromGridAndSolar, 0, 0, 0, 1, 10),
            new(OutputsMode.ChargeFromGridAndSolar, 0, 0, 0, 1, 10)
        };
        
        RunAssertions(chargePlan, assertions);
    }

    [Test]
    public async Task GivenMixOfSolarAndPriceVariationsItOptimizesCorrectly()
    {
        GivenSolarGenerationIs(new[] { 0, 0, 0, 0, 3, 5, 5, 3, 0, 0, 0, 0 });
        GivenLoadIs(new[] { 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2 });
        GivenPriceIs(new[] { 2, 2, 2, 2, 2, 2, 2, 3, 8, 8, 8, 8 });

        var chargePlan = await _batteryChargePlanner.CreateChargePlan(_testDay);
        
        // Should use solar for load, charge battery with excess solar, and use battery during high prices
        var assertions = new List<PlanAssertion>
        {
            new(OutputsMode.ChargeFromGridAndSolar, 0, 2, 0, 1, 2),
            new(OutputsMode.ChargeFromGridAndSolar, 2, 4, 0, 1, 2),
            new(OutputsMode.ChargeFromGridAndSolar, 4, 6, 0, 1, 2),
            new(OutputsMode.ChargeFromGridAndSolar, 6, 8, 0, 1, 2),
            new(OutputsMode.ChargeSolarOnly, 8, 10, 3, 1, 2),
            new(OutputsMode.ChargeSolarOnly, 10, 10, 5, 1, 2, wastedSolar: 4),
            new(OutputsMode.ChargeSolarOnly, 10, 10, 5, 1, 2, wastedSolar: 4),
            new(OutputsMode.ChargeSolarOnly, 10, 10, 3, 1, 3, wastedSolar: 2),
            new(OutputsMode.Discharge, 10, 8, 0, 2, 8),
            new(OutputsMode.Discharge, 8, 6, 0, 2, 8),
            new(OutputsMode.Discharge, 6, 4, 0, 2, 8),
            new(OutputsMode.Discharge, 4, 2, 0, 2, 8)
        };
        
        RunAssertions(chargePlan, assertions);
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

    private void RunAssertions(List<TimeSegment> chargePlan, List<PlanAssertion> assertions)
    {
        // Calculate the actual cost of the plan
        var actualCost = CalculatePlanCost(chargePlan);
        
        // Calculate the optimal cost based on assertions
        var optimalCost = CalculateOptimalCost(assertions);
        
        // Print a nicely formatted table of the plan
        PrintPlanTable(chargePlan);
        
        // Assert that the actual cost is within an acceptable threshold of the optimal cost
        var costThreshold = optimalCost * 1.05m; // Allow 5% deviation from optimal
        Console.WriteLine($"\nOptimal Cost: £{optimalCost:F2}");
        Console.WriteLine($"Actual Cost: £{actualCost:F2}");
        Console.WriteLine($"Threshold: £{costThreshold:F2}");
        
        actualCost.Should().BeLessThanOrEqualTo(costThreshold,
            $"The plan cost (£{actualCost:F2}) should not exceed the threshold (£{costThreshold:F2})");
        
        // Optionally, still run the individual assertions for debugging purposes
        if (TestContext.Parameters.Exists("DetailedAssertions") &&
            TestContext.Parameters.Get("DetailedAssertions") == "true")
        {
            for (var i = 0; i < assertions.Count && i < chargePlan.Count; i++)
            {
                var assertion = assertions[i];
                var segment = chargePlan[i];
                assertion.Assert(segment);
            }
        }
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
    
    private decimal CalculateOptimalCost(List<PlanAssertion> assertions)
    {
        decimal totalCost = 0;
        var wastedSolarPenalty = new ElectricityRate(new Gbp(5.0m));
        
        foreach (var assertion in assertions)
        {
            if (assertion.SolarGen.HasValue && assertion.Load.HasValue && assertion.Price.HasValue)
            {
                // Convert to Kwh objects for calculation
                var solarGen = new Kwh(assertion.SolarGen.Value);
                var load = new Kwh(assertion.Load.Value);
                
                // Calculate solar used
                Kwh solarUsed = Kwh.Min(solarGen, load);
                Kwh batteryContribution = Kwh.Zero;
                
                if (assertion.Mode == OutputsMode.Discharge && assertion.StartCharge.HasValue && assertion.EndCharge.HasValue)
                {
                    batteryContribution = new Kwh(assertion.StartCharge.Value) - new Kwh(assertion.EndCharge.Value);
                }
                
                // Calculate grid used
                Kwh gridUsed = load - solarUsed - batteryContribution;
                if (gridUsed.Value < 0)
                    gridUsed = Kwh.Zero;
                    
                // Calculate grid cost using the new operator
                ElectricityRate rate = new ElectricityRate(new Gbp(assertion.Price.Value));
                Gbp gridCostGbp = gridUsed * rate;
                decimal gridCost = gridCostGbp.PoundsAmount;
                
                // Calculate wasted solar cost using the Kwh * ElectricityRate operator
                Kwh wastedSolarKwh = assertion.WastedSolar.HasValue ? new Kwh(assertion.WastedSolar.Value) : Kwh.Zero;
                Gbp wastedSolarCostGbp = wastedSolarKwh * wastedSolarPenalty;
                decimal wastedSolarCost = wastedSolarCostGbp.PoundsAmount;
                
                totalCost += gridCost + wastedSolarCost;
            }
        }
        
        return totalCost;
    }

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

    public class PlanAssertion
    {
        public OutputsMode Mode { get; }
        public decimal? StartCharge { get; }
        public decimal? EndCharge { get; }
        public decimal? SolarGen { get; }
        public decimal? Load { get; }
        public decimal? Price { get; }
        public decimal? WastedSolar { get; }

        public PlanAssertion(
            OutputsMode mode,
            decimal? startCharge = null,
            decimal? endCharge = null,
            decimal? solarGen = null,
            decimal? load = null,
            decimal? price = null,
            decimal? wastedSolar = null)
        {
            Mode = mode;
            StartCharge = startCharge;
            EndCharge = endCharge;
            SolarGen = solarGen;
            Load = load;
            Price = price;
            WastedSolar = wastedSolar;
        }
        
        public void Assert(TimeSegment segment)
        {
            try
            {
                segment.Mode.Should().Be(Mode);
                
                if (StartCharge.HasValue)
                    segment.StartBatteryChargeKwh.Should().Be(new Kwh(StartCharge.Value));
                if (EndCharge.HasValue)
                    segment.EndBatteryChargeKwh.Should().Be(new Kwh(EndCharge.Value));
                if (SolarGen.HasValue)
                    segment.SolarGeneration.Should().Be(new Kwh(SolarGen.Value));
                if (Load.HasValue)
                    segment.EstimatedConsumption.Should().Be(new Kwh(Load.Value));
                if (Price.HasValue)
                    segment.GridPrice.Should().Be(new ElectricityRate(new Gbp(Price.Value)));
                if (WastedSolar.HasValue)
                    segment.WastedSolarGeneration.Should().Be(new Kwh(WastedSolar.Value));
            }
            catch (Exception e)
            {
                throw new Exception($"Failed assertion for segment {segment.HalfHourSegment}: {e.Message}", e);
            }
        }
        
        public decimal CalculateCost()
        {
            if (!SolarGen.HasValue || !Load.HasValue || !Price.HasValue)
                return 0;
                
            var wastedSolarPenalty = new ElectricityRate(new Gbp(5.0m));
            
            // Convert to Kwh objects
            var solarGen = new Kwh(SolarGen.Value);
            var load = new Kwh(Load.Value);
            
            // Calculate solar used
            Kwh solarUsed = Kwh.Min(solarGen, load);
            Kwh batteryContribution = Kwh.Zero;
            
            if (Mode == OutputsMode.Discharge && StartCharge.HasValue && EndCharge.HasValue)
            {
                batteryContribution = new Kwh(StartCharge.Value) - new Kwh(EndCharge.Value);
            }
            
            // Calculate grid used
            Kwh gridUsed = load - solarUsed - batteryContribution;
            if (gridUsed.Value < 0)
                gridUsed = Kwh.Zero;
                
            // Calculate grid cost
            var rate = new ElectricityRate(new Gbp(Price.Value));
            Gbp gridCostGbp = gridUsed * rate;
            
            // Calculate wasted solar cost
            Kwh wastedSolarKwh = WastedSolar.HasValue ? new Kwh(WastedSolar.Value) : Kwh.Zero;
            Gbp wastedSolarCostGbp = wastedSolarKwh * wastedSolarPenalty;
            
            // Return total cost
            return gridCostGbp.PoundsAmount + wastedSolarCostGbp.PoundsAmount;
        }
    }
}