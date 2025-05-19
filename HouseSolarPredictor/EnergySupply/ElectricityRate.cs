using HouseSolarPredictor.Prediction;

namespace HouseSolarPredictor.EnergySupply;

// make comparable
public record ElectricityRate(Gbp PricePerKwh) : IComparable<ElectricityRate>
{
    public int CompareTo(ElectricityRate? other)
    {
        if (other == null) return 1;
        return PricePerKwh.PoundsAmount.CompareTo(other.PricePerKwh.PoundsAmount);
    }
    
    //implicit to double
    public static implicit operator double(ElectricityRate rate)
    {
        return (double)rate.PricePerKwh.PoundsAmount;
    }
    
    public static ElectricityRate operator +(ElectricityRate a, ElectricityRate b)
    {
        return new ElectricityRate(new Gbp(a.PricePerKwh.PoundsAmount + b.PricePerKwh.PoundsAmount));
    }
    
    public static ElectricityRate operator -(ElectricityRate a, ElectricityRate b)
    {
        return new ElectricityRate(new Gbp(a.PricePerKwh.PoundsAmount - b.PricePerKwh.PoundsAmount));
    } 
    public static ElectricityRate Zero => new ElectricityRate(new Gbp(0));
    public static ElectricityRate Free => new ElectricityRate(new Gbp(0));
    public static ElectricityRate Default => new ElectricityRate(new Gbp(0.3m));
    
    // support greater than
    public static bool operator >(ElectricityRate a, ElectricityRate b)
    {
        return a.PricePerKwh.PoundsAmount > b.PricePerKwh.PoundsAmount;
    }
    
    // support less than
    public static bool operator <(ElectricityRate a, ElectricityRate b)
    {
        return a.PricePerKwh.PoundsAmount < b.PricePerKwh.PoundsAmount;
    }
    
    // max and min
    public static ElectricityRate Max(ElectricityRate a, ElectricityRate b)
    {
        return a > b ? a : b;
    }
    public static ElectricityRate Min(ElectricityRate a, ElectricityRate b)
    {
        return a < b ? a : b;
    }
    
    
    public override string ToString()
    {
        return $"{PricePerKwh.PoundsAmount:F3} £/kWh";
    }
    
    
}