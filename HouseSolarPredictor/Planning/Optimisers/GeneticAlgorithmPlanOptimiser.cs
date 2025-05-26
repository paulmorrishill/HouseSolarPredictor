using HouseSolarPredictor.EnergySupply;
using HouseSolarPredictor.Load;
using HouseSolarPredictor.Time;
using NodaTime;

namespace HouseSolarPredictor.Prediction;

public class GeneticAlgorithmPlanOptimiser : IPlanOptimiser
{
    private readonly IHouseSimulator _houseSimulator;

    private readonly ILogger _logger;


    // GA Parameters

    private const int POPULATION_SIZE = 100;

    private const int GENERATIONS = 200;

    private const double MUTATION_RATE = 0.15;

    private const double CROSSOVER_RATE = 0.8;

    private const int TOURNAMENT_SIZE = 5;

    private const int ELITE_SIZE = 10; // Number of best solutions to keep each generation

    private readonly Random _random = new Random();

    public GeneticAlgorithmPlanOptimiser(
        IHouseSimulator houseSimulator, 
        ILogger logger)
    {
        _houseSimulator = houseSimulator;
        _logger = logger;
    }

    public async Task<List<TimeSegment>> CreateChargePlan(List<TimeSegment> segments, LocalDate date)
    {
        // Run genetic algorithm to find optimal charging strategy
        var optimalChromosome = await RunGeneticAlgorithm(segments, date);
        
        // Apply optimal strategy to segments
        ApplyChromosomeToSegments(optimalChromosome, segments);
        
        // Run final simulation to populate all fields
        await _houseSimulator.RunSimulation(segments, date);
        
        var totalCost = segments.CalculatePlanCost();
        _logger.Log($"GA found optimal charge plan for {date} with total cost: {totalCost}");
        
        return segments;
    }


    private async Task<Chromosome> RunGeneticAlgorithm(List<TimeSegment> baseSegments, LocalDate date)
    {
        // Initialize population
        var population = InitializePopulation();
        
        var bestFitness = double.MaxValue;
        var generationsWithoutImprovement = 0;
        const int MAX_GENERATIONS_WITHOUT_IMPROVEMENT = 50;

        for (int generation = 0; generation < GENERATIONS; generation++)
        {
            // Evaluate fitness for all chromosomes
            var evaluatedPopulation = await EvaluatePopulation(population, baseSegments, date);
            
            // Sort by fitness (lower cost = better fitness)
            evaluatedPopulation.Sort((a, b) => a.Fitness.CompareTo(b.Fitness));
            
            var currentBestFitness = evaluatedPopulation[0].Fitness;
            
            // Check for improvement
            if (currentBestFitness < bestFitness)
            {
                bestFitness = currentBestFitness;
                generationsWithoutImprovement = 0;
                _logger.Log($"Generation {generation}: New best fitness = £{bestFitness:F4}");
            }
            else
            {
                generationsWithoutImprovement++;
            }
            
            // Early stopping if no improvement
            if (generationsWithoutImprovement >= MAX_GENERATIONS_WITHOUT_IMPROVEMENT)
            {
                _logger.Log($"Early stopping at generation {generation} - no improvement for {MAX_GENERATIONS_WITHOUT_IMPROVEMENT} generations");
                break;
            }

            // Create next generation
            var nextGeneration = CreateNextGeneration(evaluatedPopulation);
            population = nextGeneration;
        }

        // Return the best chromosome from final evaluation
        var finalEvaluation = await EvaluatePopulation(population, baseSegments, date);
        finalEvaluation.Sort((a, b) => a.Fitness.CompareTo(b.Fitness));
        
        _logger.Log($"GA completed with best fitness: £{finalEvaluation[0].Fitness:F4}");
        return finalEvaluation[0];
    }

    private List<Chromosome> InitializePopulation()
    {
        var population = new List<Chromosome>(POPULATION_SIZE);
        
        for (int i = 0; i < POPULATION_SIZE; i++)
        {
            var chromosome = new Chromosome();
            
            if (i < POPULATION_SIZE / 3)
            {
                // Random initialization
                for (int j = 0; j < 48; j++)
                {
                    chromosome.Genes[j] = (OutputsMode)_random.Next(0, 3);
                }
            }
            else if (i < 2 * POPULATION_SIZE / 3)
            {
                // Initialize with greedy heuristic - prefer discharge during expensive periods
                InitializeWithGreedyHeuristic(chromosome);
            }
            else
            {
                // Initialize with conservative strategy - mostly charge solar only
                for (int j = 0; j < 48; j++)
                {
                    chromosome.Genes[j] = OutputsMode.ChargeSolarOnly;
                }
            }
            
            population.Add(chromosome);
        }
        
        return population;
    }

    private void InitializeWithGreedyHeuristic(Chromosome chromosome)
    {
        // Simple heuristic: charge during cheap periods, discharge during expensive periods
        // This gives the GA a good starting point
        for (int i = 0; i < 48; i++)
        {
            // Night hours (cheap electricity) - charge from grid
            if (i < 16 || i > 42) // Before 8 AM or after 9:30 PM
            {
                chromosome.Genes[i] = _random.NextDouble() < 0.7 ? OutputsMode.ChargeFromGridAndSolar : OutputsMode.ChargeSolarOnly;
            }
            // Peak hours (expensive electricity) - discharge
            else if (i >= 32 && i <= 38) // 4 PM to 7 PM
            {
                chromosome.Genes[i] = OutputsMode.Discharge;
            }
            // Other hours - mixed strategy
            else
            {
                chromosome.Genes[i] = (OutputsMode)_random.Next(0, 3);
            }
        }
    }

    private async Task<List<Chromosome>> EvaluatePopulation(List<Chromosome> population, List<TimeSegment> baseSegments, LocalDate date)
    {
        var evaluatedPopulation = new List<Chromosome>();
        
        foreach (var chromosome in population)
        {
            var fitness = await EvaluateChromosome(chromosome, baseSegments, date);
            chromosome.Fitness = fitness;
            evaluatedPopulation.Add(chromosome);
        }
        
        return evaluatedPopulation;
    }

    private async Task<double> EvaluateChromosome(Chromosome chromosome, List<TimeSegment> baseSegments, LocalDate date)
    {
        // Create a copy of segments for this evaluation
        var testSegments = CloneSegments(baseSegments);
        
        // Apply chromosome to segments
        ApplyChromosomeToSegments(chromosome, testSegments);
        
        // Run simulation
        await _houseSimulator.RunSimulation(testSegments, date);
        
        // Calculate total cost (fitness = cost, lower is better)
        var totalCost = testSegments.CalculatePlanCost();
        
        // Add penalty for constraint violations (e.g., excessive battery cycling)
        var penalty = CalculatePenalty(testSegments);
        
        return (double)totalCost.PoundsAmount + penalty;
    }

    private double CalculatePenalty(List<TimeSegment> segments)
    {
        double penalty = 0;
        
        // Penalty for excessive battery cycling (rapid charge/discharge changes)
        for (int i = 1; i < segments.Count; i++)
        {
            var prevMode = segments[i - 1].Mode;
            var currentMode = segments[i].Mode;
            
            // Small penalty for switching from charge to discharge or vice versa
            if ((prevMode != OutputsMode.Discharge && currentMode == OutputsMode.Discharge) ||
                (prevMode == OutputsMode.Discharge && currentMode != OutputsMode.Discharge))
            {
                penalty += 0.001; // Small penalty to encourage smoother transitions
            }
        }
        
        return penalty;
    }

    private List<Chromosome> CreateNextGeneration(List<Chromosome> evaluatedPopulation)
    {
        var nextGeneration = new List<Chromosome>(POPULATION_SIZE);
        
        // Elitism - keep the best chromosomes
        for (int i = 0; i < ELITE_SIZE; i++)
        {
            nextGeneration.Add(new Chromosome(evaluatedPopulation[i]));
        }
        
        // Fill the rest with offspring from crossover and mutation
        while (nextGeneration.Count < POPULATION_SIZE)
        {
            var parent1 = TournamentSelection(evaluatedPopulation);
            var parent2 = TournamentSelection(evaluatedPopulation);
            
            Chromosome offspring1, offspring2;
            
            if (_random.NextDouble() < CROSSOVER_RATE)
            {
                (offspring1, offspring2) = Crossover(parent1, parent2);
            }
            else
            {
                offspring1 = new Chromosome(parent1);
                offspring2 = new Chromosome(parent2);
            }
            
            Mutate(offspring1);
            Mutate(offspring2);
            
            nextGeneration.Add(offspring1);
            if (nextGeneration.Count < POPULATION_SIZE)
            {
                nextGeneration.Add(offspring2);
            }
        }
        
        return nextGeneration;
    }

    private Chromosome TournamentSelection(List<Chromosome> population)
    {
        var tournament = new List<Chromosome>();
        
        for (int i = 0; i < TOURNAMENT_SIZE; i++)
        {
            var randomIndex = _random.Next(population.Count);
            tournament.Add(population[randomIndex]);
        }
        
        // Return the best chromosome from tournament
        return tournament.OrderBy(c => c.Fitness).First();
    }

    private (Chromosome, Chromosome) Crossover(Chromosome parent1, Chromosome parent2)
    {
        var offspring1 = new Chromosome();
        var offspring2 = new Chromosome();
        
        // Two-point crossover
        var point1 = _random.Next(1, 47);
        var point2 = _random.Next(point1 + 1, 48);
        
        for (int i = 0; i < 48; i++)
        {
            if (i < point1 || i >= point2)
            {
                offspring1.Genes[i] = parent1.Genes[i];
                offspring2.Genes[i] = parent2.Genes[i];
            }
            else
            {
                offspring1.Genes[i] = parent2.Genes[i];
                offspring2.Genes[i] = parent1.Genes[i];
            }
        }
        
        return (offspring1, offspring2);
    }

    private void Mutate(Chromosome chromosome)
    {
        for (int i = 0; i < 48; i++)
        {
            if (_random.NextDouble() < MUTATION_RATE)
            {
                // Random mutation
                chromosome.Genes[i] = (OutputsMode)_random.Next(0, 3);
            }
        }
        
        // Smart mutation - occasionally apply local optimization
        if (_random.NextDouble() < 0.1) // 10% chance
        {
            ApplySmartMutation(chromosome);
        }
    }

    private void ApplySmartMutation(Chromosome chromosome)
    {
        // Smart mutation: find a random segment and optimize its neighbors
        var centerIndex = _random.Next(2, 46); // Avoid edges
        
        // Try to create beneficial patterns
        if (_random.NextDouble() < 0.5)
        {
            // Create a charging sequence followed by discharge
            chromosome.Genes[centerIndex - 1] = OutputsMode.ChargeFromGridAndSolar;
            chromosome.Genes[centerIndex] = OutputsMode.ChargeFromGridAndSolar;
            chromosome.Genes[centerIndex + 1] = OutputsMode.Discharge;
        }
        else
        {
            // Create a solar-only charging sequence
            chromosome.Genes[centerIndex - 1] = OutputsMode.ChargeSolarOnly;
            chromosome.Genes[centerIndex] = OutputsMode.ChargeSolarOnly;
            chromosome.Genes[centerIndex + 1] = OutputsMode.ChargeSolarOnly;
        }
    }

    private List<TimeSegment> CloneSegments(List<TimeSegment> segments)
    {
        return segments.Select(s => new TimeSegment
        {
            HalfHourSegment = s.HalfHourSegment,
            ExpectedSolarGeneration = s.ExpectedSolarGeneration,
            GridPrice = s.GridPrice,
            ExpectedConsumption = s.ExpectedConsumption,
            StartBatteryChargeKwh = Kwh.Zero,
            EndBatteryChargeKwh = Kwh.Zero,
            Mode = OutputsMode.ChargeSolarOnly,
            WastedSolarGeneration = Kwh.Zero
        }).ToList();
    }

    private void ApplyChromosomeToSegments(Chromosome chromosome, List<TimeSegment> segments)
    {
        for (int i = 0; i < segments.Count && i < chromosome.Genes.Length; i++)
        {
            segments[i].Mode = chromosome.Genes[i];
        }
    }
}

/// <summary>
/// Represents a solution candidate in the genetic algorithm
/// Each chromosome encodes the charging mode for all 48 half-hour segments
/// </summary>
public class Chromosome
{
    public OutputsMode[] Genes { get; private set; }
    public double Fitness { get; set; } = double.MaxValue;

    public Chromosome()
    {
        Genes = new OutputsMode[48]; // 48 half-hour segments in a day
    }

    public Chromosome(Chromosome other)
    {
        Genes = new OutputsMode[48];
        Array.Copy(other.Genes, Genes, 48);
        Fitness = other.Fitness;
    }

    public override string ToString()
    {
        var modes = Genes.Select(g => g switch
        {
            OutputsMode.ChargeSolarOnly => "S",
            OutputsMode.ChargeFromGridAndSolar => "G",
            OutputsMode.Discharge => "D",
            _ => "?"
        });
        return string.Join("", modes) + $" (Fitness: £{Fitness:F4})";
    }
}