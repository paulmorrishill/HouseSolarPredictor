using HouseSolarPredictor.EnergySupply;
using HouseSolarPredictor.Time;

namespace HouseSolarPredictor.Prediction;

public class TimeSegment
{
    public HalfHourSegment HalfHourSegment { get; set; }
    public Kwh ExpectedSolarGeneration { get; set; } = 0.Kwh();
    public ElectricityRate GridPrice { get; set; }
    public Kwh ExpectedConsumption { get; set; } = 0.Kwh();
    
    public Kwh StartBatteryChargeKwh { get; set; } = 0.Kwh();
    public Kwh EndBatteryChargeKwh { get; set; } = 0.Kwh();
    public OutputsMode Mode { get; set; } = OutputsMode.ChargeSolarOnly;
    public Kwh WastedSolarGeneration { get; set; } = 0.Kwh();
    public Kwh ActualGridUsage { get; set; } = 0.Kwh();

    public override string ToString()
    {
        return $"{HalfHourSegment.HourStart} - {HalfHourSegment.HourEnd}: " +
               $"Solar: {ExpectedSolarGeneration:F2} kWh, " +
               $"Price: {GridPrice:F3} £/kWh, " +
               $"Mode: {Mode} " +
               $"Load: {ExpectedConsumption:F2} kWh EndB: {EndBatteryChargeKwh:F2} kWh";
    }

    public Gbp Cost()
    {
        var solarUsed = Time.Kwh.Min(ExpectedSolarGeneration, ActualGridUsage);
        var batteryContribution = Time.Kwh.Zero;
        
        if (Mode == OutputsMode.Discharge)
            batteryContribution = StartBatteryChargeKwh - EndBatteryChargeKwh;
                
        var gridUsed = ActualGridUsage - solarUsed - batteryContribution;
        if (gridUsed.Value < 0)
            gridUsed = Kwh.Zero;
            
        var gridCost = gridUsed * GridPrice;
        var wastedSolar = WastedSolarGeneration;
        var wastedSolarCostGbp = wastedSolar * GridPrice;
        
        return gridCost + wastedSolarCostGbp;
    }
}