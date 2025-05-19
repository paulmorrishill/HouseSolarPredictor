using HouseSolarPredictor.EnergySupply;
using HouseSolarPredictor.Time;

namespace HouseSolarPredictor.Prediction;

public enum OutputsMode
{
    ChargeFromGridAndSolar,
    ChargeSolarOnly,
    Discharge
}

public class TimeSegment
{
    public HalfHourSegment HalfHourSegment { get; set; }
    public Kwh SolarGeneration { get; set; }
    public ElectricityRate GridPrice { get; set; }
    public Kwh EstimatedConsumption { get; set; }
    
    public Kwh StartBatteryChargeKwh { get; set; }
    public Kwh EndBatteryChargeKwh { get; set; }
    public OutputsMode Mode { get; set; } = OutputsMode.ChargeSolarOnly;
    public Kwh WastedSolarGeneration { get; set; }

    public override string ToString()
    {
        return $"{HalfHourSegment.HourStart} - {HalfHourSegment.HourEnd}: " +
               $"Solar: {SolarGeneration:F2} kWh, " +
               $"Price: {GridPrice:F3} £/kWh, " +
               $"Mode: {Mode}";
    }
}

public record Gbp(decimal PoundsAmount)
{
    
}