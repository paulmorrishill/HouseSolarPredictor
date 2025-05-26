using System.Text.Json;
using HouseSolarPredictor.Load;
using HouseSolarPredictor.Solar;
using HouseSolarPredictor.Time;
using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;
using NodaTime;

namespace HouseSolarPredictor.Prediction;

public class LoadEnergyPredictor : ILoadPredictor
{
    private readonly InferenceSession _session;
    private readonly LoadFeatureInfo _loadFeatureInfo;
    private readonly ILoadPredictionContextProvider _contextProvider;

    /// <summary>
    /// Initializes a new instance of the LoadEnergyPredictor class
    /// </summary>
    /// <param name="modelPath">Path to the ONNX model file</param>
    /// <param name="featureInfoPath">Path to the feature information JSON file</param>
    /// <param name="contextProvider">Provider for load prediction context data</param>
    public LoadEnergyPredictor(
        string modelPath,
        string featureInfoPath,
        ILoadPredictionContextProvider contextProvider)
    {
        _contextProvider = contextProvider;
        
        // Load the ONNX model
        _session = new InferenceSession(modelPath);
        Console.WriteLine("ONNX model loaded successfully");

        // Log model inputs and outputs
        LogModelMetadata();

        // Load feature information
        var featureInfoJson = File.ReadAllText(featureInfoPath);
        _loadFeatureInfo = JsonSerializer.Deserialize<LoadFeatureInfo>(featureInfoJson)!;
        Console.WriteLine($"Loaded feature info with {_loadFeatureInfo.feature_names.Length} features");
    }

    private void LogModelMetadata()
    {
        Console.WriteLine("Model inputs:");
        foreach (var input in _session.InputMetadata)
        {
            Console.WriteLine($"  Name: {input.Key}, Shape: [{string.Join(",", input.Value.Dimensions)}]");
        }

        Console.WriteLine("Model outputs:");
        foreach (var output in _session.OutputMetadata)
        {
            Console.WriteLine($"  Name: {output.Key}, Shape: [{string.Join(",", output.Value.Dimensions)}]");
        }
    }

    /// <summary>
    /// Implements the ILoadPredictor interface to predict load for a specific day and charge segment
    /// </summary>
    public Kwh PredictLoad(int dayOfYear, HalfHourSegment halfHourSegment)
    {
        // Get context data from the provider
        var context = _contextProvider.GetContext(dayOfYear, halfHourSegment);
        
        // Call the internal implementation with the context data
        float prediction = PredictLoadEnergyInternal(
            context.Temperature,
            context.DateTime,
            context.DailyHighTemp,
            context.DailyLowTemp,
            context.PrevDayLoad,
            context.PrevWeekLoad);
        
        // Return the result as a Kwh object
        return new Kwh(prediction);
    }
    
    /// <summary>
    /// Internal implementation of load prediction
    /// </summary>
    private float PredictLoadEnergyInternal(
        float temperature,
        LocalDateTime dateTime,
        float dailyHighTemp,
        float dailyLowTemp,
        float prevDayLoad,
        float prevWeekLoad)
    {
        // Create input features dictionary
        var features = CreateFeatures(temperature, dateTime, dailyHighTemp, dailyLowTemp, prevDayLoad, prevWeekLoad);

        // Convert features to the format expected by the model
        float[] inputFeatures = CreateInputArray(features);

        // Run inference
        float prediction = RunInference(inputFeatures);

        // Ensure non-negative prediction
        return Math.Max(0, prediction);
    }

    /// <summary>
    /// Creates a dictionary of features based on input parameters
    /// </summary>
    private Dictionary<string, float> CreateFeatures(
        float temperature,
        LocalDateTime dateTime,
        float dailyHighTemp,
        float dailyLowTemp,
        float prevDayLoad,
        float prevWeekLoad)
    {
        var features = new Dictionary<string, float>();

        // Temperature features
        features["temperature_2m (°C)"] = temperature;
        features["temperature_2m_squared"] = temperature * temperature;

        // Daily temperature range features
        features["daily_high_temp"] = dailyHighTemp;
        features["daily_low_temp"] = dailyLowTemp;
        features["daily_temp_range"] = dailyHighTemp - dailyLowTemp;
        features["temp_diff_from_daily_high"] = dailyHighTemp - temperature;

        // For temp_moving_avg_3h, we would normally use historical temperatures
        // For simplicity, we'll just use the current temperature
        features["temp_moving_avg_3h"] = temperature;

        // Time features
        int hour = dateTime.Hour;
        int minute = dateTime.Minute;

        // Python's datetime.weekday() returns 0 for Monday, while C#'s DayOfWeek has 0 for Sunday
        // We need to convert between them
        int dayOfWeek = ((int)dateTime.DayOfWeek + 6) % 7; // Convert Sunday=0 to Monday=0

        features["hour"] = hour;
        features["minute"] = minute;
        features["day_of_week"] = dayOfWeek;
        features["is_weekend"] = (dayOfWeek >= 5) ? 1 : 0; // 5=Saturday, 6=Sunday

        // Cyclical time features
        features["hour_sin"] = (float)Math.Sin(2 * Math.PI * hour / 24);
        features["hour_cos"] = (float)Math.Cos(2 * Math.PI * hour / 24);
        features["minute_sin"] = (float)Math.Sin(2 * Math.PI * minute / 60);
        features["minute_cos"] = (float)Math.Cos(2 * Math.PI * minute / 60);

        // Previous load features
        features["prev_day_load"] = prevDayLoad;
        features["prev_week_load"] = prevWeekLoad;

        return features;
    }

    /// <summary>
    /// Creates the input array for the model using the feature dictionary
    /// </summary>
    private float[] CreateInputArray(Dictionary<string, float> features)
    {
        // Create array matching the expected feature order
        var inputFeatures = new float[_loadFeatureInfo.feature_names.Length];

        for (int i = 0; i < _loadFeatureInfo.feature_names.Length; i++)
        {
            string featureName = _loadFeatureInfo.feature_names[i];

            if (features.ContainsKey(featureName))
            {
                inputFeatures[i] = features[featureName];
            }
            else
            {
                Console.WriteLine($"Warning: Feature '{featureName}' not found in input data. Using 0.");
                inputFeatures[i] = 0.0f;
            }
        }

        return inputFeatures;
    }

    /// <summary>
    /// Runs inference using the ONNX model
    /// </summary>
    private float RunInference(float[] inputFeatures)
    {
        // Scale features
        float[] scaledFeatures = ScaleFeatures(inputFeatures);

        // Handle categorical features (one-hot encoding)
        float[] preprocessedFeatures = PreprocessCategoricalFeatures(scaledFeatures);

        // Create input tensor
        string inputName = _session.InputMetadata.Keys.First();
        var inputShape = _session.InputMetadata[inputName].Dimensions.ToArray();
        
        // Print dimensionality for debugging
        Console.WriteLine($"Model expects input shape: [{string.Join(",", inputShape)}]");
        Console.WriteLine($"Preprocessed features length: {preprocessedFeatures.Length}");
        
        var inputTensor = new DenseTensor<float>(preprocessedFeatures, new[] { 1, preprocessedFeatures.Length });

        // Run inference
        var inputs = new List<NamedOnnxValue>
        {
            NamedOnnxValue.CreateFromTensor(inputName, inputTensor)
        };

        using var results = _session.Run(inputs);

        // Get the prediction
        var outputTensor = results.First().AsTensor<float>();
        return outputTensor[0];
    }

    /// <summary>
    /// Scales numerical features using means and standard deviations
    /// </summary>
    private float[] ScaleFeatures(float[] features)
    {
        var scaledFeatures = new float[features.Length];
        Array.Copy(features, scaledFeatures, features.Length);

        for (int i = 0; i < features.Length; i++)
        {
            // Skip categorical features
            if (_loadFeatureInfo.categorical_features.Contains(_loadFeatureInfo.feature_names[i]))
                continue;

            scaledFeatures[i] = (features[i] - _loadFeatureInfo.means[i]) / _loadFeatureInfo.scales[i];
        }

        return scaledFeatures;
    }

    /// <summary>
    /// Preprocess categorical features (one-hot encoding)
    /// </summary>
    /// <param name="scaledFeatures">Features after scaling numerical values</param>
    /// <returns>Features with categorical values one-hot encoded</returns>
    private float[] PreprocessCategoricalFeatures(float[] scaledFeatures)
    {
        // If no categorical features, return as is
        if (_loadFeatureInfo.categorical_features.Length == 0)
            return scaledFeatures;

        // Identify categorical features and their positions
        var categoricalFeaturePositions = new Dictionary<string, int>();
        for (int i = 0; i < _loadFeatureInfo.feature_names.Length; i++)
        {
            string featureName = _loadFeatureInfo.feature_names[i];
            if (_loadFeatureInfo.categorical_features.Contains(featureName))
            {
                categoricalFeaturePositions[featureName] = i;
            }
        }

        // Calculate the total size of the preprocessed features array
        int totalSize = scaledFeatures.Length;
        foreach (var catFeature in _loadFeatureInfo.categorical_features)
        {
            if (_loadFeatureInfo.one_hot_categories.TryGetValue(catFeature, out var categories))
            {
                // Drop first category (-1) as per Python's OneHotEncoder(drop='first')
                totalSize += categories.Length - 1 - 1; // -1 for the original feature too
            }
        }

        // Create new array for preprocessed features
        var preprocessedFeatures = new float[totalSize];
        int currentIndex = 0;

        // Copy numerical features and handle categorical ones
        for (int i = 0; i < _loadFeatureInfo.feature_names.Length; i++)
        {
            string featureName = _loadFeatureInfo.feature_names[i];
            
            if (_loadFeatureInfo.categorical_features.Contains(featureName))
            {
                continue;
            }
            else
            {
                preprocessedFeatures[currentIndex++] = scaledFeatures[i];
            }
        }

        // Add one-hot encoded features for each categorical feature
        foreach (var catFeature in _loadFeatureInfo.categorical_features)
        {
            if (_loadFeatureInfo.one_hot_categories.TryGetValue(catFeature, out var categories))
            {
                int featurePos = categoricalFeaturePositions[catFeature];
                int categoryValue = (int)scaledFeatures[featurePos];
                
                // Perform one-hot encoding with drop='first' (skip first category)
                for (int i = 1; i < categories.Length; i++)
                {
                    preprocessedFeatures[currentIndex++] = categoryValue == categories[i] ? 1.0f : 0.0f;
                }
            }
        }

        if (currentIndex != totalSize)
        {
            Console.WriteLine($"Warning: Preprocessed features size mismatch. Expected {totalSize}, got {currentIndex}");
        }

        return preprocessedFeatures;
    }

    /// <summary>
    /// Predicts load energy for every half hour of a day given temperature predictions
    /// </summary>
    /// <param name="date">The date to predict for</param>
    /// <param name="temperaturePredictions">48 temperature values (one for each half hour)</param>
    /// <returns>Array of 48 load energy predictions</returns>
    public float[] PredictFullDay(DateTime date, float[] temperaturePredictions)
    {
        if (temperaturePredictions.Length != 48)
        {
            throw new ArgumentException("Temperature predictions must contain 48 values (one for each half hour)");
        }

        // Calculate daily high and low temperatures
        float dailyHighTemp = temperaturePredictions.Max();
        float dailyLowTemp = temperaturePredictions.Min();

        // Calculate 3-hour moving averages
        float[] tempMovingAvgs = CalculateMovingAverages(temperaturePredictions);

        // For simplicity, use a default value for previous loads
        // In a real implementation, we would use actual historical values
        float defaultPrevLoad = 10.0f;

        // Generate predictions for each half hour
        var predictions = new float[48];
        for (int i = 0; i < 48; i++)
        {
            int hour = i / 2;
            int minute = (i % 2) * 30;
            LocalDateTime timestamp = new LocalDateTime(date.Year, date.Month, date.Day, hour, minute, 0);

            predictions[i] = PredictLoadEnergyInternal(
                temperaturePredictions[i],
                timestamp,
                dailyHighTemp,
                dailyLowTemp,
                defaultPrevLoad,
                defaultPrevLoad);
        }

        return predictions;
    }

    /// <summary>
    /// Calculates 3-hour moving averages for temperature values
    /// </summary>
    private float[] CalculateMovingAverages(float[] temperatures)
    {
        var movingAvgs = new float[temperatures.Length];

        for (int i = 0; i < temperatures.Length; i++)
        {
            if (i < 6)
            {
                // For first few intervals, use available data
                float sum = 0;
                for (int j = 0; j <= i; j++)
                {
                    sum += temperatures[j];
                }

                movingAvgs[i] = sum / (i + 1);
            }
            else
            {
                // For remaining intervals, use full 3-hour window (6 half-hour periods)
                float sum = 0;
                for (int j = i - 5; j <= i; j++)
                {
                    sum += temperatures[j];
                }

                movingAvgs[i] = sum / 6;
            }
        }

        return movingAvgs;
    }

    // Method to help debug preprocessing issues
    public void DebugPreprocessing(float temperature, LocalDateTime dateTime, float dailyHighTemp, float dailyLowTemp)
    {
        Console.WriteLine("\n===== DEBUG PREPROCESSING =====");
        
        // Create features
        var features = CreateFeatures(temperature, dateTime, dailyHighTemp, dailyLowTemp, 10.0f, 10.0f);
        Console.WriteLine($"Created {features.Count} features");
        
        // Print features
        foreach (var feature in features)
        {
            Console.WriteLine($"  {feature.Key}: {feature.Value}");
        }
        
        // Create input array
        var inputArray = CreateInputArray(features);
        Console.WriteLine($"Input array length: {inputArray.Length}");
        
        // Scale features
        var scaledFeatures = ScaleFeatures(inputArray);
        Console.WriteLine($"Scaled features length: {scaledFeatures.Length}");
        
        // Preprocess categorical features
        var preprocessedFeatures = PreprocessCategoricalFeatures(scaledFeatures);
        Console.WriteLine($"Preprocessed features length: {preprocessedFeatures.Length}");
        
        // Check model input dimensions
        string inputName = _session.InputMetadata.Keys.First();
        var inputShape = _session.InputMetadata[inputName].Dimensions.ToArray();
        Console.WriteLine($"Model expects input shape: [{string.Join(",", inputShape)}]");
        
        // Calculate expected one-hot encoded size
        int expectedSize = inputArray.Length;
        foreach (var catFeature in _loadFeatureInfo.categorical_features)
        {
            if (_loadFeatureInfo.one_hot_categories.TryGetValue(catFeature, out var categories))
            {
                expectedSize += categories.Length - 1 - 1; // -1 for drop='first', -1 for original feature
            }
        }
        Console.WriteLine($"Expected preprocessed size: {expectedSize}");
        
        Console.WriteLine("===== END DEBUG =====\n");
    }

    /// <summary>
    /// Class to hold feature information loaded from JSON
    /// </summary>
    public class LoadFeatureInfo
    {
        public string[] feature_names { get; set; }
        public string[] categorical_features { get; set; }
        public string[] numerical_features { get; set; }
        public Dictionary<string, int[]> one_hot_categories { get; set; }
        public float[] means { get; set; }
        public float[] scales { get; set; }
    }

}