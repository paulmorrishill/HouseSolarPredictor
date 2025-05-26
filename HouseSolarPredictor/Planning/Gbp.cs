namespace HouseSolarPredictor.Prediction;

public record Gbp(decimal PoundsAmount)
{
    // plus
    public static Gbp operator +(Gbp a, Gbp b)
    {
        return new Gbp(a.PoundsAmount + b.PoundsAmount);
    }
    // minus
    public static Gbp operator -(Gbp a, Gbp b)
    {
        return new Gbp(a.PoundsAmount - b.PoundsAmount);
    }
    
    
    
    // <
    public static bool operator <(Gbp a, Gbp b)
    {
        return a.PoundsAmount < b.PoundsAmount;
    }
    
    // >
    public static bool operator >(Gbp a, Gbp b)
    {
        return a.PoundsAmount > b.PoundsAmount;
    }
    
    // Zero
    public static Gbp Zero => new Gbp(0);
    public static Gbp MaxValue => new Gbp(decimal.MaxValue);
    
    // tostring
    public override string ToString()
    {
        return $"{PoundsAmount:C2}";
    }
}