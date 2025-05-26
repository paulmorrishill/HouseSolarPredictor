using HouseSolarPredictor.Prediction;
using HouseSolarPredictor.Time;

public static class TablePrinterExtensions
{
    public static void PrintPlanTable(this List<TimeSegment> chargePlan)
    {
        var printer = new TablePrinter<TimeSegment>()
            .AddColumn("Time", c => FormatTime(c.HalfHourSegment))
            .AddColumn("Mode", c => c.Mode.ToString())
            .AddColumn("Solar", c => c.ExpectedSolarGeneration.Value.ToString("F2"))
            .AddColumn("Load", c => c.ExpectedConsumption.Value.ToString("F2"))
            .AddColumn("Grid", c => c.ActualGridUsage.Value.ToString("F2"))
            .AddColumn("Price", c => c.GridPrice.PricePerKwh.PoundsAmount.ToString("F2"))
            .AddColumn("Batt Start", c => c.StartBatteryChargeKwh.Value.ToString("F2"))
            .AddColumn("Batt End", c => c.EndBatteryChargeKwh.Value.ToString("F2"))
            .AddColumn("Wasted", c => (c.WastedSolarGeneration ?? Kwh.Zero).Value.ToString("F2"))
            .AddColumn("Cost", c => c.Cost().ToString())
            .AddFooterRow(segments => new[]
            {
                "TOTAL",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                segments.Sum(s => (s.WastedSolarGeneration ?? Kwh.Zero).Value).ToString("F2"),
                segments.ToList().CalculatePlanCost().ToString()
            });

        printer.Print(chargePlan);
    }

    private static string FormatTime(HalfHourSegment segment)
    {
        return $"{segment.HourStart:D2}:{segment.MinuteStart:D2}-{segment.HourEnd:D2}:{segment.MinuteEnd:D2}";
    }
}