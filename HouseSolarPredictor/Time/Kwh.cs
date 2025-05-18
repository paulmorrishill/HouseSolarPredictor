namespace HouseSolarPredictor.Time;

public record Kwh(float Value)
{
    public static Kwh Zero => new(0);
    
    // Allow multiplication
    public static Kwh operator *(Kwh kwh, float multiplier)
    {
        return new Kwh(kwh.Value * multiplier);
    }
    
    public static Kwh operator *(Kwh kwh, decimal multiplier)
    {
        return new Kwh(kwh.Value * (float)multiplier);
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
}