using HouseSolarPredictor.EnergySupply;
using HouseSolarPredictor.Time;

namespace HouseSolarPredictor.Prediction;

public enum OutputsMode
{
    // Discharges the battery and uses solar to supply loads, if load exceeds those the grid supplements - excess energy is stored in batteries
    LoadFirst,
    
    // Charges the battery at the battery charge rate from the grid
    BatteryFirst,
    
    // Same as battery first but sets grid charge rate to 0%, only if there is solar will it charge the battery
    BatteryFirstSolarOnly
}

public class PredictedState
{
    public Kwh StartBatteryChargeKwh { get; set; }
    public Kwh EndBatteryChargeKwh { get; set; }
}

public class TimeSegment
{
    public HalfHourSegment HalfHourSegment { get; set; }
    public Kwh SolarGeneration { get; set; }
    public ElectricityRate GridPrice { get; set; }
    public Kwh EstimatedConsumption { get; set; }
    public Kwh BatteryChargeDelta { get; set; }
    public PredictedState PredictedState { get; set; } = new PredictedState();
    public OutputsMode Mode { get; set; } = OutputsMode.LoadFirst;
        
    public override string ToString()
    {
        return $"{HalfHourSegment.HourStart} - {HalfHourSegment.HourEnd}: " +
               $"Solar: {SolarGeneration:F2} kWh, " +
               $"Price: {GridPrice:F3} £/kWh, " +
               $"Mode: {Mode}" +
               $"(Charge amount {BatteryChargeDelta:F2} kWh)";
    }
}

public record Gbp(decimal poundsAmount)
{
    
}