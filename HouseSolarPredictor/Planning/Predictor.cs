using HouseSolarPredictor.EnergySupply;
using HouseSolarPredictor.Load;
using HouseSolarPredictor.Time;
using NodaTime;

namespace HouseSolarPredictor.Prediction;

public class Predictor
{
    private ISolarPredictor _solarPredictor;
    private ILoadPredictor _loadPredictor;
    private ISupplier _supplier;
    private IBatteryPredictor _testBatteryPredictor;

    public Predictor(ISolarPredictor solarPredictor, ILoadPredictor loadPredictor, ISupplier supplier,
        IBatteryPredictor testBatteryPredictor)
    {
        _testBatteryPredictor = testBatteryPredictor;
        _supplier = supplier;
        _loadPredictor = loadPredictor;
        _solarPredictor = solarPredictor;
    }

    public async Task<List<TimeSegment>> CreateChargePlan(LocalDate date)
    {
        var startChargeKwh = Kwh.Zero;
        var timeSegments = new List<TimeSegment>();

        foreach (var segment in HalfHourSegments.AllSegments)
        {
            var solarEnergy = _solarPredictor.PredictSolarEnergy(date.DayOfYear, segment);
            var load = _loadPredictor.PredictLoad(date.DayOfYear, segment);
            var priceToChargeFromGrid = await _supplier.GetPrice(date, segment);
            timeSegments.Add(new TimeSegment
            {
                HalfHourSegment = segment,
                SolarGeneration = solarEnergy,
                GridPrice = priceToChargeFromGrid,
                EstimatedConsumption = load,
                Mode = OutputsMode.LoadFirst,
                BatteryChargeDelta = Kwh.Zero,
                PredictedState =new PredictedState
                {
                    StartBatteryChargeKwh = startChargeKwh,
                    EndBatteryChargeKwh = startChargeKwh
                }
            });
        }

        return timeSegments;
    }
}