using System.Text;
using HouseSolarPredictor.Prediction;

namespace HouseSolarPredictor;

public class FileLogger : ILogger
{
    private string _filePath;
    // buffer
    private const int BufferSize = 3000;
    private StringBuilder _logBuffer = new StringBuilder();
    
    public FileLogger(string file)
    {
        _filePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, file);
        // delete
        if (File.Exists(_filePath))
        {
            File.Delete(_filePath);
        }
    }

    public void Log(string message)
    {
        _logBuffer.AppendLine(message);
        
        // If buffer exceeds size, write to file
        if (_logBuffer.Length >= BufferSize)
        {
            // if file too large truncate
            if (File.Exists(_filePath) && new FileInfo(_filePath).Length > 1000000) // 1MB limit
            {
                File.WriteAllText(_filePath, string.Empty); // clear file
            }
            File.AppendAllText(_filePath, _logBuffer.ToString());
            _logBuffer.Clear();
        }
    }
}