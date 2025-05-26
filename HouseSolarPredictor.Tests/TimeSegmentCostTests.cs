using FluentAssertions;
using HouseSolarPredictor.Prediction;
using HouseSolarPredictor.EnergySupply;
using HouseSolarPredictor.Time;

namespace HouseSolarPredictor.Tests.Prediction;

public class TimeSegmentCostTests
{
    private TimeSegment CreateTimeSegment(
        decimal solarGeneration = 0,
        decimal gridPricePence = 20,
        decimal gridConsumed = 0,
        decimal startBatteryCharge = 0,
        decimal endBatteryCharge = 0,
        OutputsMode mode = OutputsMode.ChargeSolarOnly,
        decimal wastedSolar = 0)
    {
        return new TimeSegment
        {
            ExpectedSolarGeneration = solarGeneration.Kwh(),
            GridPrice = new ElectricityRate(new Gbp(gridPricePence/100)), // Assuming constructor takes pence
            ActualGridUsage = gridConsumed.Kwh(),
            StartBatteryChargeKwh = startBatteryCharge.Kwh(),
            EndBatteryChargeKwh = endBatteryCharge.Kwh(),
            Mode = mode,
            WastedSolarGeneration = wastedSolar.Kwh()
        };
    }

    [Test]
    public void Cost_NoConsumption_ReturnsZero()
    {
        // Arrange
        var segment = CreateTimeSegment(
            solarGeneration: 5,
            gridConsumed: 0,
            gridPricePence: 20
        );

        // Act
        var cost = segment.Cost();

        // Assert
        cost.Should().Be(Gbp.Zero);
    }

    [Test]
    public void Cost_SolarCoversAllConsumption_ReturnsZero()
    {
        // Arrange
        var segment = CreateTimeSegment(
            solarGeneration: 5,
            gridConsumed: 3,
            gridPricePence: 20
        );

        // Act
        var cost = segment.Cost();

        // Assert
        cost.Should().Be(Gbp.Zero);
    }

    [Test]
    public void Cost_GridUsageOnly_ReturnsGridCost()
    {
        // Arrange
        var segment = CreateTimeSegment(
            solarGeneration: 0,
            gridConsumed: 4,
            gridPricePence: 25 // 25p per kWh
        );

        // Act
        var cost = segment.Cost();

        // Assert
        cost.Should().Be(new Gbp(1.00m));
    }

    [Test]
    public void Cost_PartialSolarCoverage_ReturnsRemainingGridCost()
    {
        // Arrange
        var segment = CreateTimeSegment(
            solarGeneration: 2,
            gridConsumed: 5,
            gridPricePence: 30
        );

        // Act
        var cost = segment.Cost();

        // Assert
        cost.Should().Be(new Gbp(0.90m));
    }

    [Test]
    public void Cost_BatteryDischarge_ReducesGridUsage()
    {
        // Arrange
        var segment = CreateTimeSegment(
            solarGeneration: 1,
            gridConsumed: 5,
            startBatteryCharge: 8,
            endBatteryCharge: 6, // 2 kWh discharged
            mode: OutputsMode.Discharge,
            gridPricePence: 20
        );

        // Act
        var cost = segment.Cost();

        // Assert
        // Consumption: 5 kWh
        // Solar used: 1 kWh
        // Battery contribution: 2 kWh (8-6)
        // Grid needed: 5 - 1 - 2 = 2 kWh
        cost.Should().Be(new Gbp(0.40m));
    }

    [Test]
    public void Cost_BatteryDischargeNotInDischargeMode_NoReduction()
    {
        // Arrange
        var segment = CreateTimeSegment(
            solarGeneration: 1,
            gridConsumed: 5,
            startBatteryCharge: 8,
            endBatteryCharge: 6,
            mode: OutputsMode.ChargeSolarOnly, // Not discharge mode
            gridPricePence: 20
        );

        // Act
        var cost = segment.Cost();

        // Assert
        // Battery contribution should be zero since not in discharge mode
        // Grid needed: 5 - 1 = 4 kWh
        cost.Should().Be(new Gbp(0.80m));
    }

    [Test]
    public void Cost_SolarAndBatteryCoverAllConsumption_ReturnsZero()
    {
        // Arrange
        var segment = CreateTimeSegment(
            solarGeneration: 2,
            gridConsumed: 4,
            startBatteryCharge: 10,
            endBatteryCharge: 8, // 2 kWh discharged
            mode: OutputsMode.Discharge,
            gridPricePence: 25
        );

        // Act
        var cost = segment.Cost();

        // Assert
        // Solar (2) + Battery (2) = 4 kWh = Consumption (4)
        cost.Should().Be(Gbp.Zero);
    }

    [Test]
    public void Cost_ExcessSolarAndBattery_GridUsageIsZero()
    {
        // Arrange
        var segment = CreateTimeSegment(
            solarGeneration: 3,
            gridConsumed: 4,
            startBatteryCharge: 10,
            endBatteryCharge: 8, // 2 kWh discharged
            mode: OutputsMode.Discharge,
            gridPricePence: 25
        );

        // Act
        var cost = segment.Cost();

        // Assert
        // Solar (min(3,4)=3) + Battery (2) = 5 kWh > Consumption (4)
        // Grid usage should be zero
        cost.Should().Be(Gbp.Zero);
    }

    [Test]
    public void Cost_WastedSolar_AddsToTotalCost()
    {
        // Arrange
        var segment = CreateTimeSegment(
            solarGeneration: 2,
            gridConsumed: 5,
            wastedSolar: 1.5m,
            gridPricePence: 20
        );

        // Act
        var cost = segment.Cost();

        // Assert
        // Grid cost: 5 - 0.5m (solar used) = 4.5 kWh
        // Grid cost: 4.5 * £0.20 = £0.90
        // Total: £0.90
        cost.Should().Be(new Gbp(0.90m));
    }

    [Test]
    public void Cost_SolarCancelsOutUsage_InDischargeMode()
    {
        // Arrange
        var segment = CreateTimeSegment(
            solarGeneration: 10,
            gridConsumed: 10,
            wastedSolar: 0,
            gridPricePence: 20,
            mode: OutputsMode.Discharge
        );

        // Act
        var cost = segment.Cost();

        // Assert
        // Grid cost: 5 - 0.5m (solar used) = 4.5 kWh
        // Grid cost: 4.5 * £0.20 = £0.90
        // Total: £0.90
        cost.Should().Be(new Gbp(0.00m));
    }

    [Test]
    public void Cost_SolarDoesNotCancelOutUsage_InChargeMode()
    {
        // Arrange
        var segment = CreateTimeSegment(
            solarGeneration: 10,
            gridConsumed: 10,
            wastedSolar: 10,
            gridPricePence: 20,
            mode: OutputsMode.ChargeSolarOnly
        );

        // Act
        var cost = segment.Cost();

        cost.Should().Be(new Gbp(2.00m));
    }

    [Test]
    public void Cost_ComplexScenario_AllFactorsCombined()
    {
        // Arrange
        var segment = CreateTimeSegment(
            solarGeneration: 3,
            gridConsumed: 8,
            startBatteryCharge: 12,
            endBatteryCharge: 10, // 2 kWh discharged
            mode: OutputsMode.Discharge,
            wastedSolar: 0.5m,
            gridPricePence: 15
        );

        // Act
        var cost = segment.Cost();

        // Assert
        // Solar used: min(3, 8) = 3 kWh
        // Battery contribution: 2 kWh
        // Grid needed: 8 - 3 - 2 = 3 kWh
        // Grid cost: 3 * £0.15 = £0.45
        // Wasted solar cost: 0.5 * £0.15 = £0.075
        // Total: £0.525
        cost.Should().Be(new Gbp(0.525m));
    }

    [Test]
    public void Cost_ZeroGridPrice_ReturnsZero()
    {
        // Arrange
        var segment = CreateTimeSegment(
            solarGeneration: 0,
            gridConsumed: 5,
            gridPricePence: 0,
            wastedSolar: 2
        );

        // Act
        var cost = segment.Cost();

        // Assert
        cost.Should().Be(Gbp.Zero);
    }

    [Test]
    public void Cost_NegativeGridUsageCalculation_TreatedAsZero()
    {
        // Arrange - scenario where solar + battery > consumption
        var segment = CreateTimeSegment(
            solarGeneration: 10,
            gridConsumed: 3,
            startBatteryCharge: 10,
            endBatteryCharge: 8, // 2 kWh discharged
            mode: OutputsMode.Discharge,
            gridPricePence: 20
        );

        // Act
        var cost = segment.Cost();

        // Assert
        // Solar used: min(10, 3) = 3 kWh
        // Battery contribution: 2 kWh
        // Grid calculation: 3 - 3 - 2 = -2, but should be treated as 0
        cost.Should().Be(Gbp.Zero);
    }
}