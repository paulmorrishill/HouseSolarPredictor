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
        var segment = this;
        var gridCost = Gbp.Zero;
        decimal wastedSolarCost = 0;
        
        var solarUsed = Time.Kwh.Min(segment.ExpectedSolarGeneration, segment.ActualGridUsage);
        var batteryContribution = Time.Kwh.Zero;
        
        if (segment.Mode == OutputsMode.Discharge)
        {
            batteryContribution = segment.StartBatteryChargeKwh - segment.EndBatteryChargeKwh;
        }
        
        // Calculate grid electricity used (load - solar - battery)
        var gridUsed = segment.ActualGridUsage - solarUsed - batteryContribution;
        if (gridUsed.Value < 0)
            gridUsed = Time.Kwh.Zero;
            
        // Calculate grid cost using the Kwh * ElectricityRate operator
        gridCost = gridUsed * segment.GridPrice;
        
        // Calculate wasted solar cost using the Kwh * ElectricityRate operator
        var wastedSolar = segment.WastedSolarGeneration;
        var wastedSolarCostGbp = wastedSolar * segment.GridPrice;
        
        return gridCost + wastedSolarCostGbp;
    }
}