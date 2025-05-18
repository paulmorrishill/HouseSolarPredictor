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
    public decimal StartBatteryChargeKwh { get; set; }
    public decimal EndBatteryChargeKwh { get; set; }
    public decimal SolarPercentage { get; set; }
    public decimal GridPercentage { get; set; }
    public decimal BatteryPercentage { get; set; }
}

public class TimeSegment
{
    public DateTime StartTime { get; set; }
    public DateTime EndTime { get; set; }
    public Kwh SolarGeneration { get; set; }
    public Gbp EnergyPrice { get; set; }
    public Kwh EstimatedConsumption { get; set; }
    public Kwh ChargingAmount { get; set; }
    public PredictedState PredictedState { get; set; } = new PredictedState();
    public OutputsMode Mode { get; set; } = OutputsMode.LoadFirst;
        
    public override string ToString()
    {
        return $"{StartTime:HH:mm} - {EndTime:HH:mm}: " +
               $"Solar: {SolarGeneration:F2} kWh, " +
               $"Price: {EnergyPrice:F3} £/kWh, " +
               $"Mode: {Mode}" +
               $"(Charge amount {ChargingAmount:F2} kWh)";
    }
}

public record Gbp(decimal poundsAmount)
{
    
}