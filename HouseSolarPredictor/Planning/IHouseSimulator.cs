using NodaTime;

namespace HouseSolarPredictor.Prediction;

public interface IHouseSimulator
{
    Task RunSimulation(List<TimeSegment> segments, LocalDate date);
    void SimulateBatteryChargingAndWastage(TimeSegment segment);
}