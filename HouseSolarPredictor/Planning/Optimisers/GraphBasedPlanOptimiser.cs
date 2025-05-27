using HouseSolarPredictor.Load;
using HouseSolarPredictor.Prediction;
using HouseSolarPredictor.Time;
using NodaTime;

namespace HouseSolarPredictor.Planning.Optimisers;

public class GraphBasedPlanOptimiser : IPlanOptimiser
{
    private readonly IHouseSimulator _houseSimulator;
    private readonly ILogger _logger;
    private const decimal BATTERY_STEP = 0.1m;
    private readonly int _maxBatterySteps;
    private readonly decimal _batteryCapacity;

    public GraphBasedPlanOptimiser(
        IBatteryPredictor batteryPredictor,
        IHouseSimulator houseSimulator,
        ILogger logger)
    {
        _houseSimulator = houseSimulator;
        _logger = logger;

        _batteryCapacity = (decimal)batteryPredictor.Capacity.Value;
        _maxBatterySteps = (int)Math.Ceiling(_batteryCapacity / BATTERY_STEP);
    }

    public async Task<List<TimeSegment>> CreateChargePlan(List<TimeSegment> segments, LocalDate date)
    {
        var optimalPath = await FindOptimalPathDijkstra(segments, date);
        ApplyOptimalPathToSegments(optimalPath, segments);

        await _houseSimulator.RunSimulation(segments, date);
        
        var totalCost = segments.CalculatePlanCost();
        _logger.Log($"Graph-based planner found optimal charge plan for {date} with total cost: {totalCost}");
        
        return segments;
    }
    
    private async Task<List<GraphEdge>> FindOptimalPathDijkstra(List<TimeSegment> segments, LocalDate date)
    {
        const int NUM_SEGMENTS = 48;
        var priorityQueue = new PriorityQueue<GraphNode, decimal>();
        var distances = new decimal[NUM_SEGMENTS + 1][];
        var previous = new GraphEdge[NUM_SEGMENTS + 1][];
        
        for (int i = 0; i <= NUM_SEGMENTS; i++)
        {
            distances[i] = new decimal[_maxBatterySteps + 1];
            previous[i] = new GraphEdge[_maxBatterySteps + 1];
            
            Array.Fill(distances[i], decimal.MaxValue);
        }

        var startCharge = segments[0].StartBatteryChargeKwh;
        var startBatteryStep = GetStepFromBatteryState(startCharge);
        var startNode = new GraphNode(0, startBatteryStep);
        distances[0][startBatteryStep] = 0;
        priorityQueue.Enqueue(startNode, 0);

        _logger.Log($"Starting Dijkstra's algorithm with {_maxBatterySteps + 1} battery levels per segment");

        while (priorityQueue.Count > 0)
        {
            var currentNode = priorityQueue.Dequeue();
            bool betterPathAlreadyFound = distances[currentNode.Segment][currentNode.BatteryStep] < currentNode.Cost;
            if (betterPathAlreadyFound)
                continue;

            bool finalSegment = currentNode.Segment == NUM_SEGMENTS;
            if (finalSegment)
                continue;

            var transitions = await GenerateTransitions(currentNode, segments[currentNode.Segment]);
            
            foreach (var transition in transitions)
            {
                var @decimal = distances[currentNode.Segment][currentNode.BatteryStep];
                var newCost = @decimal + transition.Cost;
                var nextSegment = transition.ToNode.Segment;
                var nextBatteryStep = transition.ToNode.BatteryStep;
                
                if (newCost < distances[nextSegment][nextBatteryStep])
                {
                    distances[nextSegment][nextBatteryStep] = newCost;
                    previous[nextSegment][nextBatteryStep] = transition;
                    
                    var nextNode = new GraphNode(nextSegment, nextBatteryStep, newCost);
                    priorityQueue.Enqueue(nextNode, newCost);
                }
            }
        }

        var bestFinalCost = decimal.MaxValue;
        var bestFinalBatteryStep = 0;
        
        for (int batteryStep = 0; batteryStep <= _maxBatterySteps; batteryStep++)
        {
            if (distances[NUM_SEGMENTS][batteryStep] < bestFinalCost)
            {
                bestFinalCost = distances[NUM_SEGMENTS][batteryStep];
                bestFinalBatteryStep = batteryStep;
            }
        }

        if (bestFinalCost == decimal.MaxValue)
        {
            throw new InvalidOperationException("No valid path found through the graph");
        }

        _logger.Log($"Optimal path found with cost: £{bestFinalCost:F4}, ending battery level: {bestFinalBatteryStep * BATTERY_STEP:F1} kWh");

        return ReconstructPath(previous, NUM_SEGMENTS, bestFinalBatteryStep);
    }

    private async Task<List<GraphEdge>> GenerateTransitions(GraphNode currentNode, TimeSegment segment)
    {
        var transitions = new List<GraphEdge>();
        
        foreach (var mode in Enum.GetValues<OutputsMode>())
        {
            var transition = CalculateTransition(currentNode, segment, mode);
            if (transition != null) transitions.Add(transition);
        }
        
        return transitions;
    }

    private GraphEdge? CalculateTransition(GraphNode fromNode, TimeSegment segment, OutputsMode mode)
    {
        var currentBatteryKwh = fromNode.BatteryStep * BATTERY_STEP;
        var tempSegment = new TimeSegment
        {
            HalfHourSegment = segment.HalfHourSegment,
            ExpectedSolarGeneration = segment.ExpectedSolarGeneration,
            GridPrice = segment.GridPrice,
            ExpectedConsumption = segment.ExpectedConsumption,
            StartBatteryChargeKwh = new Kwh(currentBatteryKwh),
            EndBatteryChargeKwh = Kwh.Zero,
            Mode = mode,
            WastedSolarGeneration = Kwh.Zero,
            ActualGridUsage = Kwh.Zero
        };

        _houseSimulator.SimulateBatteryChargingAndWastage(tempSegment);
        
        var newBatteryStep = (int)Math.Round((double)tempSegment.EndBatteryChargeKwh.Value / (double)BATTERY_STEP);
        newBatteryStep = Math.Max(0, Math.Min(_maxBatterySteps, newBatteryStep));

        var cost = tempSegment.Cost().PoundsAmount;

        var toNode = new GraphNode(fromNode.Segment + 1, newBatteryStep);
        return new GraphEdge(fromNode, toNode, mode, cost, 
            (decimal)tempSegment.ActualGridUsage.Value, 
            (decimal)(tempSegment.WastedSolarGeneration?.Value ?? 0));
    }


    private int GetStepFromBatteryState(Kwh batteryCharge)
    {
        var newBatteryStep = (int)Math.Round(batteryCharge.Value / (float)BATTERY_STEP);
        var batteryStep1 = Math.Max(0, Math.Min(_maxBatterySteps, newBatteryStep));
        return batteryStep1;
    }

    private List<GraphEdge> ReconstructPath(GraphEdge[][] previous, int finalSegment, int finalBatteryStep)
    {
        var path = new List<GraphEdge>();
        var currentSegment = finalSegment;
        var currentBatteryStep = finalBatteryStep;

        while (currentSegment > 0)
        {
            var edge = previous[currentSegment][currentBatteryStep];
            if (edge == null)
            {
                throw new InvalidOperationException($"Path reconstruction failed at segment {currentSegment}, battery step {currentBatteryStep}");
            }
            
            path.Add(edge);
            currentSegment = edge.FromNode.Segment;
            currentBatteryStep = edge.FromNode.BatteryStep;
        }

        path.Reverse();
        return path;
    }

    private void ApplyOptimalPathToSegments(List<GraphEdge> optimalPath, List<TimeSegment> segments)
    {
        for (int i = 0; i < optimalPath.Count && i < segments.Count; i++)
        {
            segments[i].Mode = optimalPath[i].Mode;
        }
    }
}

public class GraphNode
{
    public int Segment { get; }
    public int BatteryStep { get; }
    public decimal Cost { get; }

    public GraphNode(int segment, int batteryStep, decimal cost = 0)
    {
        Segment = segment;
        BatteryStep = batteryStep;
        Cost = cost;
    }

    public override string ToString()
    {
        return $"Segment: {Segment}, BatteryStep: {BatteryStep}, Cost: £{Cost:F4}";
    }

    public override bool Equals(object? obj)
    {
        if (obj is GraphNode other)
        {
            return Segment == other.Segment && BatteryStep == other.BatteryStep;
        }
        return false;
    }

    public override int GetHashCode()
    {
        return HashCode.Combine(Segment, BatteryStep);
    }
}

public class GraphEdge
{
    public GraphNode FromNode { get; }
    public GraphNode ToNode { get; }
    public OutputsMode Mode { get; }
    public decimal Cost { get; }
    public decimal GridUsage { get; }
    public decimal WastedSolar { get; }

    public GraphEdge(GraphNode fromNode, GraphNode toNode, OutputsMode mode, decimal cost, decimal gridUsage, decimal wastedSolar)
    {
        FromNode = fromNode;
        ToNode = toNode;
        Mode = mode;
        Cost = cost;
        GridUsage = gridUsage;
        WastedSolar = wastedSolar;
    }

    public override string ToString()
    {
        var fromBattery = FromNode.BatteryStep * 0.5m;
        var toBattery = ToNode.BatteryStep * 0.5m;
        return $"Segment {FromNode.Segment}: {fromBattery:F1}→{toBattery:F1} kWh via {Mode}, Cost: £{Cost:F4}";
    }
}