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
    private Kwh _endBatteryChargeKwh = 0.Kwh();
    public Kwh EndBatteryChargeKwh
    {
        get
        {
            return _endBatteryChargeKwh;
        }
        set
        {
            if (value > new Kwh(30m))
                throw new ArgumentOutOfRangeException(nameof(value), "End battery charge seems to be over 30 kWh, which is not expected for a home battery.");
            _endBatteryChargeKwh = value;
        }
    }

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
        var batteryContribution = Time.Kwh.Zero;
        var solarContribution = Time.Kwh.Zero;
        
        if (Mode == OutputsMode.Discharge)
        {
            batteryContribution = StartBatteryChargeKwh - EndBatteryChargeKwh;
            // Solar only reduces grid consumption in discharge mode
            solarContribution = Kwh.Min(ExpectedSolarGeneration, ActualGridUsage);
        }
                
        var gridUsed = ActualGridUsage - batteryContribution - solarContribution;
        if (gridUsed.Value < 0)
            gridUsed = Kwh.Zero;
            
        var gridCost = gridUsed * GridPrice;
        return gridCost;
    }
}