using NodaTime;

namespace HouseSolarPredictor.Planning;

public class ScheduleSegment
{
    public TimeInfo Time { get; set; } = new();
    public string Mode { get; set; } = string.Empty;
    public decimal ExpectedSolarGeneration { get; set; }
    public decimal ExpectedConsumption { get; set; }
    public decimal ActualGridUsage { get; set; }
    public decimal GridPrice { get; set; }
    public decimal StartBatteryChargeKwh { get; set; }
    public decimal EndBatteryChargeKwh { get; set; }
    public decimal WastedSolarGeneration { get; set; }
    public decimal Cost { get; set; }
}

public class TimeInfo
{
    public DateTimeOffset SegmentStart { get; set; }
    public DateTimeOffset SegmentEnd { get; set; }
}
