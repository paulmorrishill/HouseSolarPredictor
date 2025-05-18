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

    [SetUp]
    public void Setup()
    {
        _solarPredictor = Substitute.For<ISolarPredictor>();
        _loadPredictor = Substitute.For<ILoadPredictor>();
        _supplier = Substitute.For<ISupplier>();
        _testDay = new LocalDate(2023, 1, 1);
        
        _predictor = new Predictor(_solarPredictor, _loadPredictor, _supplier);
    }

    [Test]
    public void GivenSolarWillBeHighAllDayUsesSolar()
    {
        _solarPredictor.PredictSolarEnergy(_testDay.DayOfYear, Arg.Any<HalfHourSegment>())
            .Returns(new Kwh(10));
        _loadPredictor.PredictLoad(_testDay.DayOfYear, Arg.Any<HalfHourSegment>())
            .Returns(new Kwh(2));
        _supplier.GetPrice(_testDay, Arg.Any<HalfHourSegment>())
            .Returns(new ElectricityRate(new Gbp(4)));

        var chargePlan = _predictor.CreateChargePlan(_testDay);
        chargePlan.Count.Should().Be(48);
    }
}