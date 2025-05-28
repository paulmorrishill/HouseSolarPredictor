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
            new("DoNothing", () => new DoNothingOptimiser()),
            new("HardCoded", () => new HardCodedPlanOptimiser(new List<OutputsMode>
            {
                OutputsMode.ChargeFromGridAndSolar, // 00:00
                OutputsMode.ChargeFromGridAndSolar, // 00:30
                OutputsMode.Discharge, // 01:00
                OutputsMode.Discharge, // 01:30
                OutputsMode.ChargeFromGridAndSolar, // 02:00
                OutputsMode.ChargeFromGridAndSolar, // 02:30
                OutputsMode.Discharge, // 03:00
                OutputsMode.Discharge, // 03:30
                OutputsMode.ChargeSolarOnly, // 04:00
                OutputsMode.Discharge, // 04:30
                OutputsMode.ChargeFromGridAndSolar, // 05:00
                OutputsMode.Discharge, // 05:30
                OutputsMode.Discharge, // 06:00
                OutputsMode.Discharge, // 06:30
                OutputsMode.Discharge, // 07:00
                OutputsMode.Discharge, // 07:30
                OutputsMode.Discharge, // 08:00
                OutputsMode.Discharge, // 08:30
                OutputsMode.Discharge, // 09:00
                OutputsMode.Discharge, // 09:30
                OutputsMode.Discharge, // 10:00
                OutputsMode.Discharge, // 10:30
                OutputsMode.Discharge, // 11:00
                OutputsMode.Discharge, // 11:30
                OutputsMode.Discharge, // 12:00
                OutputsMode.Discharge, // 12:30
                OutputsMode.Discharge, // 13:00
                OutputsMode.Discharge, // 13:30
                OutputsMode.ChargeFromGridAndSolar, // 14:00
                OutputsMode.ChargeFromGridAndSolar, // 14:30
                OutputsMode.Discharge, // 15:00
                OutputsMode.Discharge, // 15:30
                OutputsMode.Discharge, // 16:00
                OutputsMode.Discharge, // 16:30
                OutputsMode.Discharge, // 17:00
                OutputsMode.Discharge, // 17:30
                OutputsMode.Discharge, // 18:00
                OutputsMode.Discharge, // 18:30
                OutputsMode.Discharge, // 19:00
                OutputsMode.Discharge, // 19:30
                OutputsMode.Discharge, // 20:00
                OutputsMode.Discharge, // 20:30
                OutputsMode.Discharge, // 21:00
                OutputsMode.Discharge, // 21:30
                OutputsMode.Discharge, // 22:00
                OutputsMode.ChargeSolarOnly, // 22:30
                OutputsMode.Discharge, // 23:00
                OutputsMode.Discharge // 23:30
            }))


        };
    
        var results = await RunScenarioComparison(optimizers);

        CompareOptimiserResults(results, "HardCoded", "Graph", "RealLifeLowSunHighDayCost");
        PrintOptimisersPlanTable(results, "Graph", "RealLifeLowSunHighDayCost");
        PrintOptimisersPlanTable(results, "HardCoded", "RealLifeLowSunHighDayCost");
        
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
            },
            new Scenario
            {
                Name = "RealLifeLowSunHighDayCost",
                ExpectedOptimalCost = 0m,
                Setup = () =>
                {
                    _testBatteryPredictor.Capacity = 10.Kwh();
                    _testBatteryPredictor.GridChargePerSegment = 2.74m.Kwh();
                    GivenSolarGenerationIs(new[]
                    {
                        0, 0, 0, 0, 0, 0, 0, 0, 0.10007175m, 0.04713461m, 0.22051363m, 0.22171257m,
                        0.28912544m, 0.2850905m, 0.41548014m, 0.39047146m, 0.44485903m, 0.4293384m,
                        0.4814728m, 0.4682505m, 0.49915266m, 0.48540497m, 0.48313332m, 0.46791416m,
                        0.45839447m, 0.44242024m, 0.15682328m, 0.12387929m, 0.15183017m, 0.11198262m,
                        0.121514685m, 0.08784457m, 0.14024189m, 0.11197152m, 0.07956257m, 0,
                        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
                    });
                    GivenLoadIs(new[]
                    {
                        0.6061084m, 0.55227244m, 0.62960196m, 0.5579202m, 0.6632049m, 0.6085008m, 0.6298902m, 0.6344258m,
                        0.56223506m, 0.5852691m, 0.5074662m, 0.51969576m, 0.4974346m, 0.48632568m, 0.501091m, 0.48839518m,
                        0.5071417m, 0.48948595m, 0.50974715m, 0.49044374m, 0.523811m, 0.4950631m, 0.5552084m, 0.5262901m,
                        0.5800062m, 0.560846m, 0.60386693m, 0.5867344m, 0.6238527m, 0.59890604m, 0.64699113m, 0.6094108m,
                        0.6716515m, 0.63961464m, 0.74122834m, 0.7229106m, 0.84837496m, 0.77082944m, 0.8864411m, 0.7729598m,
                        0.84393084m, 0.71927375m, 0.81213224m, 0.6884618m, 0.756212m, 0.65459746m, 0.7107478m, 0.6288116m
                    });
                    GivenPriceIs(new[]
                    {
                        0.145635m, 0.134295m, 0.13461m, 0.140595m, 0.142905m, 0.13356m, 0.137445m, 0.13503m,
                        0.15687m, 0.14847m, 0.180915m, 0.18711m, 0.21378m, 0.22407m, 0.24675m, 0.24948m,
                        0.243915m, 0.24255m, 0.238455m, 0.221025m, 0.206325m, 0.197085m, 0.199395m, 0.190785m,
                        0.1848m, 0.17556m, 0.17346m, 0.15897m, 0.164745m, 0.1617m, 0.16191m, 0.17178m,
                        0.30849m, 0.30849m, 0.31773m, 0.31773m, 0.35427m, 0.37548m, 0.273525m, 0.26334m,
                        0.273945m, 0.27258m, 0.266385m, 0.25872m, 0.208845m, 0.19572m, 0.208m, 0.2165m
                    });
                }
            }

        };
    }
    
    private void CompareOptimiserResults(Dictionary<string, Dictionary<string, ScenarioResult>> results, 
    string firstOptimiser, string secondOptimiser, string scenario)
    {
        Console.WriteLine($"=== {firstOptimiser} vs {secondOptimiser} - {scenario} ===");
        
        var firstResult = results[firstOptimiser][scenario];
        var secondResult = results[secondOptimiser][scenario];
        var scenarioInstance = GetAllScenarios().First(s => s.Name == scenario);
        
        PrintComparisonSegmentTable(firstResult.ChargePlan, secondResult.ChargePlan, 
            firstOptimiser, secondOptimiser, scenarioInstance);
    }

    private void PrintComparisonSegmentTable(List<TimeSegment> firstPlan, List<TimeSegment> secondPlan,
        string firstOptimiser, string secondOptimiser, Scenario scenario)
    {
        Console.WriteLine("=== SEGMENT COMPARISON ===");
        Console.WriteLine($"Showing {firstOptimiser} compared to {secondOptimiser}");
        Console.WriteLine();

        var printer = new TablePrinter<(TimeSegment First, TimeSegment Second)>()
            .AddColumn("Time",
                pair => $"{pair.First.HalfHourSegment.HourStart:D2}:{pair.First.HalfHourSegment.MinuteStart:D2}")
            .AddColumn("Price", pair => FormatComparison(pair.First.GridPrice, pair.Second.GridPrice, "F2"))
            .AddColumn("Segment Cost", pair => FormatComparison(
                pair.First.GridPrice * pair.First.ActualGridUsage,
                pair.Second.GridPrice * pair.Second.ActualGridUsage, "F2"))
            .AddColumn("Solar (kWh)", pair => FormatComparison(
                pair.First.ExpectedSolarGeneration.Value,
                pair.Second.ExpectedSolarGeneration.Value, "F1"))
            .AddColumn("Load (kWh)", pair => FormatComparison(
                pair.First.ExpectedConsumption.Value,
                pair.Second.ExpectedConsumption.Value, "F1"))
            .AddColumn("Battery Start (kWh)", pair => FormatComparison(
                pair.First.StartBatteryChargeKwh.Value,
                pair.Second.StartBatteryChargeKwh.Value, "F1"))
            .AddColumn("Battery End (kWh)", pair => FormatComparison(
                pair.First.EndBatteryChargeKwh.Value,
                pair.Second.EndBatteryChargeKwh.Value, "F1"))
            .AddColumn("Grid Usage (kWh)", pair => FormatComparison(
                pair.First.ActualGridUsage.Value,
                pair.Second.ActualGridUsage.Value, "F1"))
            .AddColumn("Wasted Solar (kWh)", pair => FormatComparison(
                pair.First.WastedSolarGeneration.Value,
                pair.Second.WastedSolarGeneration.Value, "F1"))
            .AddColumn("Mode", pair => FormatModeComparison(pair.First.Mode, pair.Second.Mode));

        // Zip the two plans together for comparison
        var pairedSegments = firstPlan.Zip(secondPlan, (first, second) => (First: first, Second: second)).ToList();

        printer.Print(pairedSegments);
    }

    private string FormatComparison(Gbp firstValue, Gbp secondValue, string format)
    {
        return FormatComparison(firstValue.PoundsAmount, secondValue.PoundsAmount, format);
    }
    

    private string FormatComparison(double firstValue, double secondValue, string format)
    {
        return FormatComparison((decimal)firstValue, (decimal)secondValue, format);
    }
    
    private string FormatComparison(decimal firstValue, decimal secondValue, string format)
    {
        var firstStr = firstValue.ToString(format);
        var secondStr = secondValue.ToString(format);

        if (firstStr == secondStr)
        {
            return firstStr;
        }

        // calculate diff
        var diff = firstValue - secondValue;
        if (Math.Abs(diff) < 0.01m)
        {
            return firstStr; // negligible difference
        }
        
        var plusSign = diff > 0 ? "+" : "";
        
        return $"{firstStr} ({plusSign}{diff.ToString(format)})";
    }

    private string FormatModeComparison(object firstMode, object secondMode)
    {
        var firstModeStr = firstMode?.ToString() ?? "";
        var secondModeStr = secondMode?.ToString() ?? "";

        if (firstModeStr == secondModeStr)
        {
            return firstModeStr;
        }

        return $"{firstModeStr} (was {secondModeStr})";
    }

    private void PrintOptimisersPlanTable(Dictionary<string, Dictionary<string, ScenarioResult>> results, string optimiser, string scenario)
    {
        Console.WriteLine($"=== {optimiser} - {scenario} ===");
        var scenarioResult = results[optimiser][scenario];
        var scenarioInstance = GetAllScenarios().First(s => s.Name == scenario);
        PrintSegmentTable(scenarioResult.ChargePlan, scenarioInstance);
    }

    private void PrintSegmentTable(List<TimeSegment> chargePlan, Scenario scenario)
    {
        Console.WriteLine("=== SEGMENT BREAKDOWN ===");

        var printer = new TablePrinter<TimeSegment>()
            .AddColumn("Time", s => $"{s.HalfHourSegment.HourStart:D2}:{s.HalfHourSegment.MinuteStart:D2}")
            .AddColumn("Price", s => $"{s.GridPrice:D2}")
            .AddColumn("Segment Cost", s => $"{s.GridPrice * s.ActualGridUsage:D2}")
            .AddColumn("Solar (kWh)", s => $"{s.ExpectedSolarGeneration.Value:F1}")
            .AddColumn("Load (kWh)", s => $"{s.ExpectedConsumption.Value:F1}")
            .AddColumn("Battery Start (kWh)", s => $"{s.StartBatteryChargeKwh.Value:F1}")
            .AddColumn("Battery End (kWh)", s => $"{s.EndBatteryChargeKwh.Value:F1}")
            .AddColumn("Grid Usage (kWh)", s => $"{s.ActualGridUsage.Value:F1}")
            .AddColumn("Wasted Solar (kWh)", s => $"{s.WastedSolarGeneration.Value:F1}")
            .AddColumn("Mode", s => $"{s.Mode}");

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

