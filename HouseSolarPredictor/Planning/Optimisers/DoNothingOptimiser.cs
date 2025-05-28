using HouseSolarPredictor.Prediction;
using NodaTime;

namespace HouseSolarPredictor.Planning.Optimisers;

public class DoNothingOptimiser : IPlanOptimiser
{
    public Task<List<TimeSegment>> CreateChargePlan(List<TimeSegment> segments, LocalDate date)
    {
        segments.ForEach(s => s.Mode = OutputsMode.Discharge);
        return Task.FromResult(segments);
    }
}
public class HardCodedPlanOptimiser : IPlanOptimiser
{
    private List<OutputsMode> _modes;

    public HardCodedPlanOptimiser(List<OutputsMode> modes)
    {
        _modes = modes;
    }
    public async Task<List<TimeSegment>> CreateChargePlan(List<TimeSegment> segments, LocalDate date)
    {
        for(int i = 0; i < segments.Count; i++)
        {
            if (i < _modes.Count)
            {
                segments[i].Mode = _modes[i];
            }
            else
            {
                segments[i].Mode = OutputsMode.Discharge; // Default to discharge if no mode provided
            }
        }

        return segments;
    }
}

