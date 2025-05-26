using FluentAssertions;
using HouseSolarPredictor.Prediction;
using HouseSolarPredictor.Time;
using NodaTime;

namespace HouseSolarPredictor.Tests;

public class HouseSimulatorTests
{
    private TestBatteryPredictor _batteryPredictor;
    private HouseSimulator _houseSimulator;

    [SetUp]
    public void SetUp()
    {
        _batteryPredictor = new TestBatteryPredictor();
        _houseSimulator = new HouseSimulator(_batteryPredictor);
    }
    
    [Test]
    public async Task ChargeSolarOnly_NotEnoughSolar_ChargesBattery()
    {
        var segments = new List<TimeSegment>
        {
            new()
            {
                Mode = OutputsMode.ChargeSolarOnly,
                ExpectedSolarGeneration = 2.Kwh(),
                ExpectedConsumption = 5.Kwh(),
                StartBatteryChargeKwh = 0.Kwh(),
                EndBatteryChargeKwh = 0.Kwh(),
            }
        };
        
        await _houseSimulator.RunSimulation(segments, new LocalDate(2025, 1, 1));
        
        segments[0].StartBatteryChargeKwh.Should().Be(0.Kwh());
        segments[0].EndBatteryChargeKwh.Should().Be(2.Kwh()); // Battery charged with available solar
        segments[0].WastedSolarGeneration.Should().Be(0.Kwh()); // No excess solar wasted
        segments[0].ActualGridUsage.Should().Be(5.Kwh()); // 5 kwh, solar goes to battery only
    }
    
    [Test]
    public async Task ChargeSolarOnly_WithinCapacity_ChargesBattery()
    {
        var segments = new List<TimeSegment>
        {
            new()
            {
                Mode = OutputsMode.ChargeSolarOnly,
                ExpectedSolarGeneration = 5.Kwh(),
                ExpectedConsumption = 0.Kwh(),
                StartBatteryChargeKwh = 0.Kwh(),
                EndBatteryChargeKwh = 0.Kwh(),
            }
        };
        
        await _houseSimulator.RunSimulation(segments, new LocalDate(2025, 1, 1));
        
        segments[0].StartBatteryChargeKwh.Should().Be(0.Kwh());
        segments[0].EndBatteryChargeKwh.Should().Be(5.Kwh());
        segments[0].WastedSolarGeneration.Should().Be(0.Kwh());
    }

    [Test]
    public async Task ChargeSolarOnly_ExceedsCapacity_WastesSolarGeneration()
    {
        var segments = new List<TimeSegment>
        {
            new()
            {
                Mode = OutputsMode.ChargeSolarOnly,
                ExpectedSolarGeneration = 15.Kwh(), // Exceeds 10kWh capacity
                ExpectedConsumption = 0.Kwh(),
                StartBatteryChargeKwh = 0.Kwh(),
                EndBatteryChargeKwh = 0.Kwh(),
            }
        };
        
        await _houseSimulator.RunSimulation(segments, new LocalDate(2025, 1, 1));
        
        segments[0].StartBatteryChargeKwh.Should().Be(0.Kwh());
        segments[0].EndBatteryChargeKwh.Should().Be(10.Kwh()); // Capped at battery capacity
        segments[0].WastedSolarGeneration.Should().Be(5.Kwh()); // 15 - 10 = 5kWh wasted
    }

    [Test]
    public async Task ChargeFromGridAndSolar_WithinCapacity_ChargesBattery()
    {
        var segments = new List<TimeSegment>
        {
            new()
            {
                Mode = OutputsMode.ChargeFromGridAndSolar,
                ExpectedSolarGeneration = 3.Kwh(),
                ExpectedConsumption = 1.5m.Kwh(),
                StartBatteryChargeKwh = 4.5m.Kwh(),
                EndBatteryChargeKwh = 0.Kwh(),
            }
        };
        
        await _houseSimulator.RunSimulation(segments, new LocalDate(2025, 1, 1));
        
        segments[0].StartBatteryChargeKwh.Should().Be(2.Kwh());
        segments[0].EndBatteryChargeKwh.Should().Be(7.Kwh()); // 2 + 3 + 2 (grid charge)
        segments[0].WastedSolarGeneration.Should().Be(0.Kwh());
    }

    [Test]
    public async Task ChargeFromGridAndSolar_ExceedsCapacity_WastesSolarGeneration()
    {
        var segments = new List<TimeSegment>
        {
            new()
            {
                Mode = OutputsMode.ChargeFromGridAndSolar,
                ExpectedSolarGeneration = 12.Kwh(),
                ExpectedConsumption = 0.Kwh(),
                StartBatteryChargeKwh = 5.Kwh(),
                EndBatteryChargeKwh = 0.Kwh(),
            }
        };
        
        await _houseSimulator.RunSimulation(segments, new LocalDate(2025, 1, 1));
        
        segments[0].StartBatteryChargeKwh.Should().Be(5.Kwh());
        segments[0].EndBatteryChargeKwh.Should().Be(10.Kwh()); // Capped at battery capacity
        // Total charge would be 5 + 12 + 2 = 19kWh, excess is 9kWh, half assumed from solar
        segments[0].WastedSolarGeneration.Should().Be(4.5m.Kwh()); // 9 / 2 = 4.5kWh wasted solar
        segments[0].ActualGridUsage.Should().Be(2.Kwh()); // 2kWh from grid
    }

    [Test]
    public async Task Discharge_SolarDeficit_DischargesBattery()
    {
        var segments = new List<TimeSegment>
        {
            new()
            {
                Mode = OutputsMode.Discharge,
                ExpectedSolarGeneration = 2.Kwh(),
                ExpectedConsumption = 5.Kwh(), // More than solar
                StartBatteryChargeKwh = 8.Kwh(),
                EndBatteryChargeKwh = 0.Kwh(),
            }
        };
        
        await _houseSimulator.RunSimulation(segments, new LocalDate(2025, 1, 1));
        
        segments[0].StartBatteryChargeKwh.Should().Be(8.Kwh());
        // Deficit is 3kWh, but battery discharge is limited by available charge
        segments[0].EndBatteryChargeKwh.Should().Be(5.Kwh()); // 8 - 3
        
    }

    [Test]
    public async Task Discharge_SolarDeficit_BatteryEmpty_DoesNotGoBelowZero()
    {
        var segments = new List<TimeSegment>
        {
            new()
            {
                Mode = OutputsMode.Discharge,
                ExpectedSolarGeneration = 1.Kwh(),
                ExpectedConsumption = 10.Kwh(), // Much more than solar + battery
                StartBatteryChargeKwh = 2.Kwh(),
                EndBatteryChargeKwh = 0.Kwh(),
            }
        };
        
        await _houseSimulator.RunSimulation(segments, new LocalDate(2025, 1, 1));
        
        segments[0].StartBatteryChargeKwh.Should().Be(2.Kwh());
        // Deficit is 9kWh, but only 2kWh available in battery
        segments[0].EndBatteryChargeKwh.Should().Be(0.Kwh()); // Max(0, 2 - 2)
        segments[0].ActualGridUsage.Should().Be(7.Kwh()); // 10 - 1 (solar) - 2 (battery)
    }

    [Test]
    public async Task Discharge_SolarSurplus_ChargesBattery()
    {
        var segments = new List<TimeSegment>
        {
            new()
            {
                Mode = OutputsMode.Discharge,
                ExpectedSolarGeneration = 8.Kwh(),
                ExpectedConsumption = 3.Kwh(), // Less than solar
                StartBatteryChargeKwh = 2.Kwh(),
                EndBatteryChargeKwh = 0.Kwh(),
            }
        };
        
        await _houseSimulator.RunSimulation(segments, new LocalDate(2025, 1, 1));
        
        segments[0].StartBatteryChargeKwh.Should().Be(2.Kwh());
        // Surplus is 5kWh, so battery gets charged
        segments[0].EndBatteryChargeKwh.Should().Be(7.Kwh()); // 2 + 5
    }

    [Test]
    public async Task Discharge_SolarEqualsUsage_BatteryUnchanged()
    {
        var segments = new List<TimeSegment>
        {
            new()
            {
                Mode = OutputsMode.Discharge,
                ExpectedSolarGeneration = 4.Kwh(),
                ExpectedConsumption = 4.Kwh(), // Exactly equal
                StartBatteryChargeKwh = 3.Kwh(),
                EndBatteryChargeKwh = 0.Kwh(),
            }
        };
        
        await _houseSimulator.RunSimulation(segments, new LocalDate(2025, 1, 1));
        
        segments[0].StartBatteryChargeKwh.Should().Be(3.Kwh());
        // No surplus or deficit, so battery charge remains the same
        segments[0].EndBatteryChargeKwh.Should().Be(3.Kwh());
        segments[0].ActualGridUsage.Should().Be(0.Kwh()); // No grid usage
    }

    [Test]
    public async Task MultipleSegments_MaintainsBatteryStateAcrossSegments()
    {
        var segments = new List<TimeSegment>
        {
            new()
            {
                Mode = OutputsMode.ChargeSolarOnly,
                ExpectedSolarGeneration = 3.Kwh(),
                ExpectedConsumption = 0.Kwh(),
                StartBatteryChargeKwh = 0.Kwh(),
                EndBatteryChargeKwh = 0.Kwh(),
            },
            new()
            {
                Mode = OutputsMode.Discharge,
                ExpectedSolarGeneration = 1.Kwh(),
                ExpectedConsumption = 2.Kwh(),
                StartBatteryChargeKwh = 0.Kwh(),
                EndBatteryChargeKwh = 0.Kwh(),
            }
        };
        
        await _houseSimulator.RunSimulation(segments, new LocalDate(2025, 1, 1));
        
        // First segment charges battery
        segments[0].StartBatteryChargeKwh.Should().Be(0.Kwh());
        segments[0].EndBatteryChargeKwh.Should().Be(3.Kwh());
        
        // Second segment starts with charge from first segment
        segments[1].StartBatteryChargeKwh.Should().Be(3.Kwh());
        segments[1].EndBatteryChargeKwh.Should().Be(2.Kwh()); // 3 - 1 (deficit)
    }

    [Test]
    public void InvalidMode_ThrowsInvalidOperationException()
    {
        var segments = new List<TimeSegment>
        {
            new()
            {
                Mode = (OutputsMode)999, // Invalid mode
                ExpectedSolarGeneration = 1.Kwh(),
                ExpectedConsumption = 1.Kwh(),
                StartBatteryChargeKwh = 1.Kwh(),
                EndBatteryChargeKwh = 0.Kwh(),
            }
        };
        
        var act = async () => await _houseSimulator.RunSimulation(segments, new LocalDate(2025, 1, 1));
        
        act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("Unexpected mode: 999");
    }
}
