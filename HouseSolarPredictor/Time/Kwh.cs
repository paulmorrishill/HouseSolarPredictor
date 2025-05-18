namespace HouseSolarPredictor.Time;

public record Kwh(float Value)
{
    public static Kwh Zero => new(0);
}