using FluentAssertions;
using HouseSolarPredictor.Prediction;
using HouseSolarPredictor.EnergySupply;
using HouseSolarPredictor.Time;
using NodaTime;

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
    public void Cost_SolarCoversAllConsumption_InChargeModeStillUsesGrid()
    {
        // Arrange - In ChargeSolarOnly mode, solar doesn't reduce grid consumption
        var segment = CreateTimeSegment(
            solarGeneration: 5,
            gridConsumed: 3,
            gridPricePence: 20,
            mode: OutputsMode.ChargeSolarOnly
        );

        // Act
        var cost = segment.Cost();

        // Assert
        // Solar doesn't reduce grid consumption in charge mode
        cost.Should().Be(new Gbp(0.60m)); // 3 kWh * £0.20 = £0.60
    }

    [Test]
    public void Cost_SolarCoversAllConsumption_InDischargeModeReturnsZero()
    {
        // Arrange - In Discharge mode, solar DOES reduce grid consumption
        var segment = CreateTimeSegment(
            solarGeneration: 5,
            gridConsumed: 3,
            gridPricePence: 20,
            mode: OutputsMode.Discharge
        );

        // Act
        var cost = segment.Cost();

        // Assert
        // In discharge mode, solar reduces grid consumption
        cost.Should().Be(Gbp.Zero); // 3 - min(5,3) = 0 kWh grid needed
    }

    [Test]
    public void Cost_PartialSolarCoverage_InDischargeModeReducesGrid()
    {
        // Arrange - In Discharge mode, solar DOES reduce grid consumption
        var segment = CreateTimeSegment(
            solarGeneration: 2,
            gridConsumed: 5,
            gridPricePence: 30,
            mode: OutputsMode.Discharge
        );

        // Act
        var cost = segment.Cost();

        // Assert
        // In discharge mode, solar reduces grid consumption
        // Grid needed: 5 - min(2,5) = 3 kWh * £0.30 = £0.90
        cost.Should().Be(new Gbp(0.90m));
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
    public void Cost_PartialSolarCoverage_InChargeModeUsesFullGrid()
    {
        // Arrange - In ChargeSolarOnly mode, solar doesn't reduce grid consumption
        var segment = CreateTimeSegment(
            solarGeneration: 2,
            gridConsumed: 5,
            gridPricePence: 30,
            mode: OutputsMode.ChargeSolarOnly
        );

        // Act
        var cost = segment.Cost();

        // Assert
        // Solar doesn't reduce grid consumption in charge mode
        cost.Should().Be(new Gbp(1.50m)); // 5 kWh * £0.30 = £1.50
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
            solarGeneration: 100,
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
        // Solar doesn't reduce grid consumption in charge mode
        // Grid needed: 5 kWh (full consumption)
        cost.Should().Be(new Gbp(1.00m)); // 5 kWh * £0.20 = £1.00
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
    public void Cost_WastedSolar_InChargeModeDoesNotReduceGrid()
    {
        // Arrange - In ChargeSolarOnly mode, solar doesn't reduce grid consumption
        var segment = CreateTimeSegment(
            solarGeneration: 2,
            gridConsumed: 5,
            wastedSolar: 1.5m,
            gridPricePence: 20,
            mode: OutputsMode.ChargeSolarOnly
        );

        // Act
        var cost = segment.Cost();

        // Assert
        // In charge mode, solar doesn't reduce grid consumption
        // Grid cost: 5 kWh * £0.20 = £1.00
        cost.Should().Be(new Gbp(1.00m));
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
        // Note: Wasted solar is not included in cost calculation
        cost.Should().Be(new Gbp(0.45m));
    }

    [Test]
    public void GridAndSolarItIncreasesActualGridUsage()
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
    public void BatteryNotDischaringMeansGridIsUsed()
    {
        // Arrange
        var segment = CreateTimeSegment(
            solarGeneration: 0,
            gridConsumed: 5,
            gridPricePence: 20,
            wastedSolar: 0,
            startBatteryCharge: 10,
            endBatteryCharge: 10,
            mode: OutputsMode.ChargeFromGridAndSolar
        );

        // Act
        var cost = segment.Cost();

        // Assert
        cost.Should().Be(new Gbp(1.00m)); // 5 kWh * £0.20 = £1.00
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

    [Test]
    public void Cost_ExcessSolarBeyondLoadAndBattery_DoesNotAffectGridCost()
    {
        // Arrange - scenario where solar > load + battery charge capacity
        var segment = CreateTimeSegment(
            solarGeneration: 15, // Very high solar
            gridConsumed: 5,     // Moderate load
            startBatteryCharge: 8,
            endBatteryCharge: 10, // Only 2 kWh battery charge
            mode: OutputsMode.ChargeSolarOnly, // Charging mode
            gridPricePence: 20
        );

        // Act
        var cost = segment.Cost();

        // Assert
        // In charge mode, solar doesn't reduce grid consumption
        // Even though solar (15) > load (5) + battery charge (2) = 7 kWh
        // The excess solar (8 kWh) should not create negative grid costs
        // Grid cost should be: 5 kWh * £0.20 = £1.00
        cost.Should().Be(new Gbp(1.00m));
    }

    [Test]
    public void Cost_ExcessSolarInDischargeMode_DoesNotCreateNegativeGridCost()
    {
        // Arrange - scenario where solar > actual grid usage in discharge mode
        var segment = CreateTimeSegment(
            solarGeneration: 10, // High solar
            gridConsumed: 3,     // Low actual grid usage
            startBatteryCharge: 8,
            endBatteryCharge: 8, // No battery discharge
            mode: OutputsMode.Discharge,
            gridPricePence: 20
        );

        // Act
        var cost = segment.Cost();

        // Assert
        // In discharge mode, solar can reduce grid consumption
        // Solar used: min(10, 3) = 3 kWh (limited by actual grid usage)
        // Grid needed: 3 - 3 = 0 kWh
        // Cost should be zero, not negative
        cost.Should().Be(Gbp.Zero);
    }

    [Test]
    public void CanSumUpSegmentCosts()
    {
        var segments = new List<TimeSegment>
        {
            CreateTimeSegment(solarGeneration: 2, gridConsumed: 5, gridPricePence: 20, mode: OutputsMode.ChargeSolarOnly),
            CreateTimeSegment(solarGeneration: 1, gridConsumed: 3, gridPricePence: 25, mode: OutputsMode.ChargeSolarOnly),
            CreateTimeSegment(solarGeneration: 0, gridConsumed: 4, gridPricePence: 30, mode: OutputsMode.ChargeSolarOnly)
        };
        
        var totalCost = segments.CalculatePlanCost();
        // In ChargeSolarOnly mode, solar doesn't reduce grid consumption
        // First segment: 5 kWh grid * £0.20 = £1.00
        // Second segment: 3 kWh grid * £0.25 = £0.75
        // Third segment: 4 kWh grid * £0.30 = £1.20
        var expectedCost = new Gbp(1.00m + 0.75m + 1.20m); // Total: £2.95
        totalCost.Should().Be(expectedCost);
    }
    
    /*
     *   {
    "time": {
      "segmentStart": "2025-06-02T14:30:00+00:00",
      "segmentEnd": "2025-06-02T15:00:00+00:00"
    },
    "mode": "ChargeSolarOnly",
    "expectedSolarGeneration": 0.7780608,
    "expectedConsumption": 0.6675967,
    "actualGridUsage": 0.6675967,
    "gridPrice": 0.3256,
    "startBatteryChargeKwh": 8.580339,
    "endBatteryChargeKwh": 9.3584,
    "wastedSolarGeneration": 0.0,
    "cost": 0.0000
  },
     */
    [Test]
    public void Cost_ExampleSegmentFromJson_ReturnsExpectedCost()
    {
        // Arrange
        var segment = new TimeSegment
        {
            HalfHourSegment = new HalfHourSegment(14, 30), // 2:30 PM
            Mode = OutputsMode.ChargeSolarOnly,
            ExpectedSolarGeneration = 0.7780608.Kwh(),
            ExpectedConsumption = 0.6675967.Kwh(),
            ActualGridUsage = 0.6675967.Kwh(),
            GridPrice = new ElectricityRate(new Gbp(0.3256m)),
            StartBatteryChargeKwh = 8.580339.Kwh(),
            EndBatteryChargeKwh = 9.3584.Kwh(),
            WastedSolarGeneration = 0.Kwh()
        };

        // Act
        var cost = segment.Cost();

        // Assert
        // In ChargeSolarOnly mode, solar doesn't reduce grid consumption
        // Cost = ActualGridUsage * GridPrice = 0.6675967 * 0.3256 = 0.21736948552
        cost.Should().Be(new Gbp(0.21736948552M));
    }
}