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

    public Predictor(ISolarPredictor solarPredictor, ILoadPredictor loadPredictor, ISupplier supplier)
    {
        _supplier = supplier;
        _loadPredictor = loadPredictor;
        _solarPredictor = solarPredictor;
    }

    public List<TimeSegment> CreateChargePlan(LocalDate date)
    {
        var startChargeKwh = Kwh.Zero;
        foreach (var segment in HalfHourSegments.AllSegments)
        {
            var solarEnergy = _solarPredictor.PredictSolarEnergy(date.DayOfYear, segment);
            var load = _loadPredictor.PredictLoad(date.DayOfYear, segment);
            var priceToChargeFromGrid = _supplier.GetPrice(date, segment);
            
        }

        return new List<TimeSegment>();
    }
}