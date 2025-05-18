using HouseSolarPredictor.Prediction;

namespace HouseSolarPredictor.EnergySupply;

public class EnergyPrice
{
    public DateTime ValidFrom { get; set; }
    public DateTime ValidTo { get; set; }
    public Gbp PricePerKwh { get; set; }
}