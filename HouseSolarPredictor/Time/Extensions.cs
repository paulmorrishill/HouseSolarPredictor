using HouseSolarPredictor.EnergySupply;
using HouseSolarPredictor.Prediction;

namespace HouseSolarPredictor.Time;

public static class Extensions
{
    public static Kwh Kwh(this decimal value)
    {
        return new Kwh(value);
    }
    
    public static Kwh Kwh(this float value)
    {
        return new Kwh(value);
    }
    
    public static Kwh Kwh(this double value)
    {
        return new Kwh((float)value);
    }
    
    public static Kwh Kwh(this int value)
    {
        return new Kwh((decimal)value);
    }
    
    public static Gbp CalculatePlanCost(this List<TimeSegment> segments)
    {
        return CalculatePlanCost2(segments);
    }
    private static Gbp CalculatePlanCost2(List<TimeSegment> chargePlan)
    {
        Gbp totalCost = Gbp.Zero;
        
        foreach (var segment in chargePlan)
        {
            totalCost += segment.Cost();
        }
        
        return totalCost;
    }
    
}