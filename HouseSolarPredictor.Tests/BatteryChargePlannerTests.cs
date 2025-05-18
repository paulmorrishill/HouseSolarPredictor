using FluentAssertions;
using HouseSolarPredictor.EnergySupply;
using HouseSolarPredictor.Load;
using HouseSolarPredictor.Prediction;
using HouseSolarPredictor.Solar;
using HouseSolarPredictor.Time;
using NodaTime;
using NSubstitute;

namespace HouseSolarPredictor.Tests;

public class Tests
{
    private Predictor _predictor;
    private ISolarPredictor _solarPredictor;
    private ILoadPredictor _loadPredictor;
    private ISupplier _supplier;
    private LocalDate _testDay;

    private class TestBatteryPredictor : IBatteryPredictor
    {
        public Kwh PredictNewBatteryState(Kwh startCapacity, Kwh inputCharge)
        {
            return startCapacity + inputCharge * 0.8m;
        }
    }
    
    [SetUp]
    public void Setup()
    {
        _solarPredictor = Substitute.For<ISolarPredictor>();
        _loadPredictor = Substitute.For<ILoadPredictor>();
        _supplier = Substitute.For<ISupplier>();
        _testDay = new LocalDate(2023, 1, 1);
        
        _predictor = new Predictor(_solarPredictor, _loadPredictor, _supplier, new TestBatteryPredictor());
    }

    [Test]
    public async Task GivenSolarWillBeHighAllDayUsesSolar()
    {
        _solarPredictor.PredictSolarEnergy(_testDay.DayOfYear, Arg.Any<HalfHourSegment>())
            .Returns(new Kwh(10));
        _loadPredictor.PredictLoad(_testDay.DayOfYear, Arg.Any<HalfHourSegment>())
            .Returns(new Kwh(2));
        _supplier.GetPrice(_testDay, Arg.Any<HalfHourSegment>())
            .Returns(new ElectricityRate(new Gbp(4)));

        var chargePlan = await _predictor.CreateChargePlan(_testDay);
        
        chargePlan.Count.Should().Be(48);
        chargePlan[0].SolarGeneration.Should().Be(new Kwh(10));
        chargePlan[0].EstimatedConsumption.Should().Be(new Kwh(2));
        chargePlan[0].GridPrice.Should().Be(new ElectricityRate(new Gbp(4)));
        chargePlan[0].Mode.Should().Be(OutputsMode.LoadFirst);
        chargePlan[0].BatteryChargeDelta.Should().Be(8m);
        chargePlan[0].PredictedState.StartBatteryChargeKwh.Should().Be(Kwh.Zero);
        chargePlan[0].PredictedState.EndBatteryChargeKwh.Should().Be(new Kwh(8));
    }
}