using Newtonsoft.Json;
using NodaTime;
using NodaTime.Serialization.JsonNet;

namespace HouseSolarPredictor.Planning;

public class ScheduleFileManager
{
    private readonly string _filePath;
    private readonly JsonSerializerSettings _jsonSettings;

    public ScheduleFileManager(string filePath)
    {
        _filePath = filePath;
        _jsonSettings = new JsonSerializerSettings
        {
            ContractResolver = new Newtonsoft.Json.Serialization.CamelCasePropertyNamesContractResolver(),
            Formatting = Formatting.Indented,
            DateFormatHandling = DateFormatHandling.IsoDateFormat
        };
    }

    public async Task SaveScheduleAsync(IEnumerable<ScheduleSegment> segments)
    {
        var directory = Path.GetDirectoryName(_filePath);
        if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
        {
            Directory.CreateDirectory(directory);
        }
        var existingScheduleItems = new List<ScheduleSegment>();
        if (File.Exists(_filePath))
        {
            var existingJson = await File.ReadAllTextAsync(_filePath);
            existingScheduleItems = JsonConvert.DeserializeObject<List<ScheduleSegment>>(existingJson);
        }
        
        // remove any with same date as any in new segments
        existingScheduleItems.RemoveAll(s => segments.Any(newSegment => newSegment.Time.SegmentStart == s.Time.SegmentStart));
        
        // add new segments
        existingScheduleItems.AddRange(segments);
        var sorted = existingScheduleItems
            .OrderBy(s => s.Time.SegmentStart)
            .ToList();
        
        var json = JsonConvert.SerializeObject(sorted, _jsonSettings);
        await File.WriteAllTextAsync(_filePath, json);
    }
}