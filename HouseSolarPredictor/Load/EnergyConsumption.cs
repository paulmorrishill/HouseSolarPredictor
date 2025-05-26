using NodaTime;

namespace HouseSolarPredictor.Load;

public class EnergyConsumption
{
    public LocalDateTime IntervalStart { get; set; }
    public LocalDateTime IntervalEnd { get; set; }
    public float ConsumptionKwh { get; set; }
}