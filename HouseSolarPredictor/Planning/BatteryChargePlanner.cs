using Google.OrTools.LinearSolver;
using HouseSolarPredictor.EnergySupply;
using HouseSolarPredictor.Load;
using HouseSolarPredictor.Time;
using NodaTime;

namespace HouseSolarPredictor.Prediction;

public class BatteryChargePlanner
{
    private ISolarPredictor _solarPredictor;
    private ILoadPredictor _loadPredictor;
    private ISupplier _supplier;
    private IBatteryPredictor _BatteryPredictor;

    public BatteryChargePlanner(ISolarPredictor solarPredictor, ILoadPredictor loadPredictor, ISupplier supplier,
        IBatteryPredictor batteryPredictor)
    {
        _BatteryPredictor = batteryPredictor;
        _supplier = supplier;
        _loadPredictor = loadPredictor;
        _solarPredictor = solarPredictor;
    }

    public async Task<List<TimeSegment>> CreateChargePlan(LocalDate date)
    {
        throw new NotImplementedException();
    }
}