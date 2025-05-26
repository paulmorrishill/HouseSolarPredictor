using HouseSolarPredictor.EnergySupply;
using HouseSolarPredictor.Load;
using HouseSolarPredictor.Prediction;
using HouseSolarPredictor.Time;
using NodaTime;
using NSubstitute;
using HouseSolarPredictor.Planning.Optimisers;

namespace HouseSolarPredictor.Tests;

public class OptimiserBlackBoxTests
{
    private ISolarPredictor _solarPredictor;
    private ILoadPredictor _loadPredictor;
    private ISupplier _supplier;
    private LocalDate _testDay;
    private FileLogger _fileLogger;
    private TestBatteryPredictor _testBatteryPredictor;
    private HouseSimulator _houseSimulator;

    [SetUp]
    public void Setup()
    {
        _solarPredictor = Substitute.For<ISolarPredictor>();
        _loadPredictor = Substitute.For<ILoadPredictor>();
        _supplier = Substitute.For<ISupplier>();
        _testDay = new LocalDate(2023, 1, 1);
        _fileLogger = new FileLogger("genetic_test.log");

        _testBatteryPredictor = new TestBatteryPredictor();
        _houseSimulator = new HouseSimulator(_testBatteryPredictor);
        
        SetupDefaultSubstituteBehavior();
    }

    private void SetupDefaultSubstituteBehavior()
    {
        // Default solar generation of 0 for all segments
        foreach (var segment in HalfHourSegments.AllSegments)
        {
            _solarPredictor.PredictSolarEnergy(_testDay.DayOfYear, segment)
                .Returns(Kwh.Zero);
            _loadPredictor.PredictLoad(_testDay.DayOfYear, segment)
                .Returns(Kwh.Zero);
            _supplier.GetPrice(_testDay, segment)
                .Returns(new ElectricityRate(new Gbp(0)));
        }
    }

    [Test]
    public async Task CompareOptimizers()
    {
        var optimizers = new List<OptimizerConfig>
        {
            new("Graph", () => new GraphBasedPlanOptimiser(_testBatteryPredictor, _houseSimulator, _fileLogger)),
            new("Dynamic", () => new DynamicProgrammingPlanOptimiser(_fileLogger, _houseSimulator, _testBatteryPredictor)),
            new("Genetic400", () => new GeneticAlgorithmPlanOptimiser(_houseSimulator, _fileLogger, generations: 400)),
            new("Genetic200", () => new GeneticAlgorithmPlanOptimiser(_houseSimulator, _fileLogger, generations: 200)),
            new("Graph", () => new GraphBasedPlanOptimiser(_testBatteryPredictor, _houseSimulator, _fileLogger)),
            new("Dynamic", () => new DynamicProgrammingPlanOptimiser(_fileLogger, _houseSimulator, _testBatteryPredictor)),
            new("SimpleStacker", () => new ScoringOptimiser()),
            new("DoNothing", () => new DoNothingOptimiser())
        };

        var results = await RunScenarioComparison(optimizers);

        var scenario = "High Solar All Day";
        var scenarioResult = results["Graph"][scenario];
        var scenarioInstance = GetAllScenarios().First(s => s.Name == scenario);
        PrintSegmentTable(scenarioResult.ChargePlan, scenarioInstance);
    }
    
    private void PrintSegmentTable(List<TimeSegment> chargePlan, Scenario scenario)
    {
        Console.WriteLine("=== SEGMENT BREAKDOWN ===");

        var printer = new TablePrinter<TimeSegment>()
            .AddColumn("Time", s => $"{s.HalfHourSegment.HourStart:D2}:{s.HalfHourSegment.MinuteStart:D2}")
            .AddColumn("Solar (kWh)", s => $"{s.ExpectedSolarGeneration.Value:F1}")
            .AddColumn("Load (kWh)", s => $"{s.ExpectedConsumption.Value:F1}")
            .AddColumn("Battery Start (kWh)", s => $"{s.StartBatteryChargeKwh.Value:F1}")
            .AddColumn("Battery End (kWh)", s => $"{s.EndBatteryChargeKwh.Value:F1}")
            .AddColumn("Grid Usage (kWh)", s => $"{s.ActualGridUsage.Value:F1}")
            .AddColumn("Wasted Solar (kWh)", s => $"{s.WastedSolarGeneration.Value:F1}");

        printer.Print(chargePlan);
    }


    private async Task<Dictionary<string, Dictionary<string, ScenarioResult>>> RunScenarioComparison(List<OptimizerConfig> optimizers)
    {
        var scenarios = GetAllScenarios();
        var results = new Dictionary<string, Dictionary<string, ScenarioResult>>();

        // Initialize results structure
        foreach (var optimizer in optimizers)
        {
            results[optimizer.Name] = new Dictionary<string, ScenarioResult>();
        }

        Console.WriteLine($"Running {scenarios.Count} scenarios against {optimizers.Count} optimizers...\n");

        // Run each scenario against each optimizer
        foreach (var scenario in scenarios)
        {
            Console.WriteLine($"Running scenario: {scenario.Name}");
            
            foreach (var optimizerConfig in optimizers)
            {
                var optimiser = optimizerConfig.OptimizerFactory();
                var chargePlanner = new ChargePlanner(_solarPredictor, _loadPredictor, _supplier,
                    _testBatteryPredictor, _houseSimulator, optimiser);
                var result = await RunScenario(scenario, chargePlanner);
                results[optimizerConfig.Name][scenario.Name] = result;
                Console.WriteLine($"  {optimizerConfig.Name}: £{result.ActualCost:F2} (Target: £{scenario.ExpectedOptimalCost:F2})");
            }
            Console.WriteLine();
        }

        // Generate and print comparison table
        PrintComparisonTable(scenarios, optimizers, results);
        PrintSummaryScores(scenarios, optimizers, results);
        return results;
    }

    private async Task<ScenarioResult> RunScenario(Scenario scenario, ChargePlanner planner)
    {
        // Reset substitutes to default state
        SetupDefaultSubstituteBehavior();
        
        // Apply scenario setup using the shared fields
        scenario.Setup();

        var startTime = DateTime.UtcNow;
        var chargePlan = await planner.CreateChargePlan(_testDay, scenario.InitialBatteryCharge);
        var executionTime = DateTime.UtcNow - startTime;

        var actualCost = chargePlan.CalculatePlanCost().PoundsAmount;

        // validate the charge plan
        var batteryErrors = chargePlan.Any(c => c.StartBatteryChargeKwh < 0m || c.EndBatteryChargeKwh < 0m);
        var overCharge = chargePlan.Any(c => c.EndBatteryChargeKwh > _testBatteryPredictor.Capacity);
        if (batteryErrors)
        {
            throw new InvalidOperationException($"{planner.Optimiser.GetType()} Charge plan contains invalid battery states (negative charge).");
        }
        
        if (overCharge)
        {
            var overchargedSegments = chargePlan.Where(c => c.EndBatteryChargeKwh > _testBatteryPredictor.Capacity).ToList();
            var overchargedHours = string.Join(", ", overchargedSegments.Select(c => $"{c.HalfHourSegment.HourStart:D2}:{c.HalfHourSegment.MinuteStart:D2} - {c.HalfHourSegment.HourEnd:D2}:{c.HalfHourSegment.MinuteEnd:D2} ({c.EndBatteryChargeKwh:F2} kWh)"));
            throw new InvalidOperationException($"{planner.Optimiser.GetType()} Charge plan contains overcharged battery states. Maximum capacity: {_testBatteryPredictor.Capacity} kWh. Overcharged segments: {overchargedHours}");
        }
        
        return new ScenarioResult
        {
            ActualCost = actualCost,
            ExecutionTime = executionTime,
            ChargePlan = chargePlan
        };
    }

    private void PrintComparisonTable(List<Scenario> scenarios, List<OptimizerConfig> optimizers, 
        Dictionary<string, Dictionary<string, ScenarioResult>> results)
    {
        Console.WriteLine("=== DETAILED RESULTS ===");
    
        var printer = new TablePrinter<Scenario>()
            .AddColumn("Scenario", s => s.Name)
            .AddColumn("Target", s => $"£{s.ExpectedOptimalCost:F2}");

        foreach (var optimizer in optimizers)
        {
            printer
                .AddColumn($"{optimizer.Name} Cost", scenario =>
                {
                    var result = results[optimizer.Name][scenario.Name];
                    return !string.IsNullOrEmpty(result.Error)
                        ? "ERROR"
                        : $"£{result.ActualCost:F2}";
                });
        }

        // add winner column, if scores are equal, show all optimizers, if all are same then show "Equal"
        printer
            .AddColumn("Winner", scenario =>
            {
                var bestCost = decimal.MaxValue;
                var winners = new List<string>();

                foreach (var optimizer in optimizers)
                {
                    var result = results[optimizer.Name][scenario.Name];
                    if (string.IsNullOrEmpty(result.Error) && result.ActualCost < bestCost)
                    {
                        bestCost = result.ActualCost;
                        winners.Clear();
                        winners.Add(optimizer.Name);
                    }
                    else if (result.ActualCost == bestCost)
                    {
                        winners.Add(optimizer.Name);
                    }
                }

                return winners.Count == optimizers.Count ? "Equal" : string.Join(", ", winners);
            });
        
        printer.Print(scenarios);
        Console.WriteLine();
    }

    private void PrintSummaryScores(List<Scenario> scenarios, List<OptimizerConfig> optimizers,
        Dictionary<string, Dictionary<string, ScenarioResult>> results)
    {
        Console.WriteLine("=== SUMMARY SCORES ===");
        
        foreach (var optimizer in optimizers)
        {
            var totalScore = 0.0;
            var successfulScenarios = 0;
            var totalExecutionTime = TimeSpan.Zero;

            foreach (var scenario in scenarios)
            {
                var result = results[optimizer.Name][scenario.Name];
                if (string.IsNullOrEmpty(result.Error))
                {
                    totalScore += CalculateScore(scenario.ExpectedOptimalCost, result.ActualCost);
                    successfulScenarios++;
                    totalExecutionTime = totalExecutionTime.Add(result.ExecutionTime);
                }
            }

            var averageScore = successfulScenarios > 0 ? totalScore / successfulScenarios : 0;
            var averageExecutionTime = successfulScenarios > 0 ? 
                TimeSpan.FromMilliseconds(totalExecutionTime.TotalMilliseconds / successfulScenarios) : 
                TimeSpan.Zero;

            Console.WriteLine($"{optimizer.Name}:");
            Console.WriteLine($"  Average Score: {averageScore:F1}");
            Console.WriteLine($"  Successful Scenarios: {successfulScenarios}/{scenarios.Count}");
            Console.WriteLine($"  Average Execution Time: {averageExecutionTime.TotalMilliseconds:F0}ms");
            Console.WriteLine();
        }
    }

    private double CalculateScore(decimal expectedCost, decimal actualCost)
    {
        if (expectedCost == 0) return actualCost == 0 ? 100 : 0;
        
        var ratio = (double)(actualCost / expectedCost);
        
        // Perfect score (100) for matching expected cost exactly
        // Decreasing score as cost increases above expected
        // 0 score for costs 50% or more above expected
        return Math.Max(0, 100 - Math.Max(0, (ratio - 1) * 200));
    }

    private List<Scenario> GetAllScenarios()
    {
        return new List<Scenario>
        {
            new Scenario
            {
                Name = "High Solar All Day",
                ExpectedOptimalCost = 0m,
                Setup = () =>
                {
                    GivenSolarGenerationForAllSegmentsIs(10);
                    GivenLoadForAllSegmentsIs(2);
                    GivenPriceForAllSegmentsIs(4);
                }
            },

            new Scenario
            {
                Name = "No Solar Same Grid Price",
                ExpectedOptimalCost = 0m,
                Setup = () =>
                {
                    GivenSolarGenerationForAllSegmentsIs(0);
                    GivenLoadForAllSegmentsIs(1);
                    GivenPriceForAllSegmentsIs(4);
                }
            },

            new Scenario
            {
                Name = "Expensive Afternoon",
                ExpectedOptimalCost = 0m,
                Setup = () =>
                {
                    GivenSolarGenerationForAllSegmentsIs(0);
                    GivenLoadForAllSegmentsIs(1);
                    GivenPriceForAllSegmentsIs(2);
                    GivenPriceForHours("10-12", 7);
                }
            },

            new Scenario
            {
                Name = "Solar Exceeds Load",
                ExpectedOptimalCost = 0m,
                Setup = () =>
                {
                    GivenSolarGenerationForAllSegmentsIs(5);
                    GivenLoadForAllSegmentsIs(2);
                    GivenPriceForAllSegmentsIs(4);
                }
            },

            new Scenario
            {
                Name = "Evening High Prices",
                ExpectedOptimalCost = 0m,
                Setup = () =>
                {
                    GivenSolarGenerationIs(new[] { 0, 0, 0, 3, 5, 5, 5, 3, 0, 0, 0, 0 });
                    GivenLoadIs(new[] { 1, 1, 1, 1, 1, 1, 1, 1, 3, 3, 3, 3 });
                    GivenPriceIs(new[] { 3, 3, 3, 2, 2, 2, 2, 2, 8, 8, 8, 8 });
                }
            },

            new Scenario
            {
                Name = "Price Dip During Day",
                ExpectedOptimalCost = 0m,
                Setup = () =>
                {
                    GivenSolarGenerationIs(new[] { 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0 });
                    GivenLoadIs(new[] { 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2 });
                    GivenPriceIs(new[] { 5, 5, 5, 5, 1, 1, 5, 5, 5, 5, 5, 5 });
                }
            },

            new Scenario
            {
                Name = "Battery Starts Full",
                ExpectedOptimalCost = 0m,
                InitialBatteryCharge = 10.Kwh(),
                Setup = () =>
                {
                    GivenSolarGenerationForAllSegmentsIs(0);
                    GivenLoadForAllSegmentsIs(2);
                    GivenPriceIs(new[] { 2, 2, 2, 5, 5, 5, 5, 5, 5, 2, 2, 2 });
                }
            },

            new Scenario
            {
                Name = "Gradual Price Increase",
                ExpectedOptimalCost = 0m,
                Setup = () =>
                {
                    GivenSolarGenerationForAllSegmentsIs(0);
                    GivenLoadForAllSegmentsIs(1);
                    GivenPriceIs(new[] { 4, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6 });
                }
            },

            new Scenario
            {
                Name = "Extreme Price Variation",
                ExpectedOptimalCost = 0m,
                Setup = () =>
                {
                    GivenSolarGenerationForAllSegmentsIs(0);
                    GivenLoadForAllSegmentsIs(1);
                    GivenPriceIs(new[] { 10, 10, 1, 1, 10, 10, 10, 10, 10, 10, 10, 10 });
                }
            },

            new Scenario
            {
                Name = "Mixed Solar And Price Variations",
                ExpectedOptimalCost = 0m,
                Setup = () =>
                {
                    GivenSolarGenerationIs(new[] { 0, 0, 0, 0, 3, 5, 5, 3, 0, 0, 0, 0 });
                    GivenLoadIs(new[] { 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2 });
                    GivenPriceIs(new[] { 2, 2, 2, 2, 2, 2, 2, 3, 8, 8, 8, 8 });
                }
            }
        };
    }

    private void GivenPriceForHours(string range, decimal pricePerKwh)
    {
        var parts = range.Split('-');
        var startHour = int.Parse(parts[0]);
        var endHour = int.Parse(parts[1]);
        
        foreach (var segment in HalfHourSegments.AllSegments)
        {
            if (segment.HourStart >= startHour && segment.HourStart < endHour)
            {
                _supplier.GetPrice(_testDay, segment).Returns(new ElectricityRate(new Gbp(pricePerKwh)));
            }
        }
    }

    private void GivenSolarGenerationIs(decimal[] values)
    {
        for (var i = 0; i < HalfHourSegments.AllSegments.Count; i++)
        {
            var value = i < values.Length ? values[i] : 0m;
            _solarPredictor.PredictSolarEnergy(_testDay.DayOfYear, HalfHourSegments.AllSegments[i])
                .Returns(new Kwh(value));
        }
    }
    
    private void GivenSolarGenerationIs(int[] values)
    {
        GivenSolarGenerationIs(values.Select(v => (decimal)v).ToArray());
    }

    private void GivenLoadIs(decimal[] values)
    {
        for (var i = 0; i < HalfHourSegments.AllSegments.Count; i++)
        {
            var value = i < values.Length ? values[i] : 0m;
            _loadPredictor.PredictLoad(_testDay.DayOfYear, HalfHourSegments.AllSegments[i])
                .Returns(new Kwh(value));
        }
    }
    
    private void GivenLoadIs(int[] values)
    {
        GivenLoadIs(values.Select(v => (decimal)v).ToArray());
    }

    private void GivenPriceIs(decimal[] values)
    {
        for (var i = 0; i < HalfHourSegments.AllSegments.Count; i++)
        {
            var value = i < values.Length ? values[i] : values.LastOrDefault();
            _supplier.GetPrice(_testDay, HalfHourSegments.AllSegments[i]).Returns(new ElectricityRate(new Gbp(value)));
        }
    }
    
    private void GivenPriceIs(int[] values)
    {
        GivenPriceIs(values.Select(v => (decimal)v).ToArray());
    }

    private void GivenPriceForAllSegmentsIs(decimal price)
    {
        foreach (var segment in HalfHourSegments.AllSegments)
        {
            _supplier.GetPrice(_testDay, segment).Returns(new ElectricityRate(new Gbp(price)));
        }
    }

    private void GivenLoadForAllSegmentsIs(decimal load)
    {
        foreach (var segment in HalfHourSegments.AllSegments)
        {
            _loadPredictor.PredictLoad(_testDay.DayOfYear, segment).Returns(new Kwh(load));
        }
    }

    private void GivenSolarGenerationForAllSegmentsIs(decimal solarGenForSegment)
    {
        foreach (var segment in HalfHourSegments.AllSegments)
        {
            _solarPredictor.PredictSolarEnergy(_testDay.DayOfYear, segment).Returns(new Kwh(solarGenForSegment));
        }
    }
}

// Supporting classes
public class Scenario
{
    public string Name { get; set; }
    public decimal ExpectedOptimalCost { get; set; }
    public Action Setup { get; set; }
    public Kwh InitialBatteryCharge { get; set; } = 0.Kwh();
}

public class OptimizerConfig
{
    public string Name { get; }
    public Func<IPlanOptimiser> OptimizerFactory { get; }

    public OptimizerConfig(string name, Func<IPlanOptimiser> optimizerFactory)
    {
        Name = name;
        OptimizerFactory = optimizerFactory;
    }
}

public class ScenarioResult
{
    public decimal ActualCost { get; set; }
    public TimeSpan ExecutionTime { get; set; }
    public List<TimeSegment> ChargePlan { get; set; }
    public string Error { get; set; }
}

