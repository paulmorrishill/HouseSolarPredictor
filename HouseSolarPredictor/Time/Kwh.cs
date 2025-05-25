using HouseSolarPredictor.EnergySupply;
using HouseSolarPredictor.Prediction;

namespace HouseSolarPredictor.Time;

public record Kwh(float Value)
{
    public Kwh(Decimal value)
        : this((float)value)
    {
    }
    public Kwh(double value)
        : this((float)value)
    {
    }
    
    public static implicit operator Kwh(float value)
    {
        return new Kwh(value);
    }
    
    public static implicit operator Kwh(decimal value)
    {
        return new Kwh((float)value);
    }
    
    public static Kwh Zero => new(0m);
    
    // Allow multiplication
    public static Kwh operator *(Kwh kwh, float multiplier)
    {
        return new Kwh(kwh.Value * multiplier);
    }
    
    public static Kwh operator *(Kwh kwh, decimal multiplier)
    {
        return new Kwh(kwh.Value * (float)multiplier);
    }
    
    // Multiply Kwh by ElectricityRate to produce Gbp
    public static Gbp operator *(Kwh kwh, ElectricityRate rate)
    {
        return new Gbp((decimal)kwh.Value * rate.PricePerKwh.PoundsAmount);
    }
    
    // Allow addition
    public static Kwh operator +(Kwh kwh1, Kwh kwh2)
    {
        return new Kwh(kwh1.Value + kwh2.Value);
    }
    
    // Allow subtraction
    public static Kwh operator -(Kwh kwh1, Kwh kwh2)
    {
        return new Kwh(kwh1.Value - kwh2.Value);
    }
    
    // Allow division
    public static Kwh operator /(Kwh kwh, float divisor)
    {
        if (divisor == 0)
            throw new DivideByZeroException("Cannot divide by zero.");
        return new Kwh(kwh.Value / divisor);
    }

    public static Kwh Min(Kwh first, Kwh second)
    {
        return new Kwh(Math.Min(first.Value, second.Value));
    }

    public static Kwh Max(Kwh first, Kwh second)
    {
        return new Kwh(Math.Max(first.Value, second.Value));
    }

    // > and <
    public static bool operator >(Kwh a, Kwh b)
    {
        return a.Value > b.Value;
    }
    
    public static bool operator <(Kwh a, Kwh b)
    {
        return a.Value < b.Value;
    }
    
    public override string ToString()
    {
        return $"{Value:F2} kWh";
    }

    public Kwh AbsoluteValue()
    {
        return new Kwh(Math.Abs(Value));
    }
}