using System.Text.Json;
using HouseSolarPredictor.Load;
using HouseSolarPredictor.Time;
using HouseSolarPredictor.Weather;
using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;

namespace HouseSolarPredictor.Solar
{
    public class SolarPredictor : ISolarPredictor
    {
        private readonly InferenceSession _session;
        private readonly ScalingParams _scalingParams;
        private readonly List<ComputedValue> _computedValues;
        private readonly ISolarPredictionContextProvider _contextProvider;

        public SolarPredictor(
            string modelPath,
            string scalingParamsPath,
            string computedValuesPath,
            ISolarPredictionContextProvider contextProvider)
        {
            _session = new InferenceSession(modelPath);
            _contextProvider = contextProvider;
            Console.WriteLine("ONNX model loaded successfully");

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

            // Load scaling parameters
            var scalingJson = File.ReadAllText(scalingParamsPath);
            _scalingParams = JsonSerializer.Deserialize<ScalingParams>(scalingJson);
            Console.WriteLine($"Loaded {_scalingParams.feature_names.Length} feature scaling parameters");

            // Load computed values reference data
            var computedValuesJson = File.ReadAllText(computedValuesPath);
            _computedValues = JsonSerializer.Deserialize<List<ComputedValue>>(computedValuesJson);
            Console.WriteLine($"Loaded computed values for {_computedValues.Count} days of the year");
        }

        public Kwh PredictSolarEnergy(int dayOfYear, HalfHourSegment halfHourSegment)
        {
            // Get context data from the provider
            var context = _contextProvider.GetContext(dayOfYear, halfHourSegment);
            
            // Call the existing implementation with the retrieved data
            float prediction = PredictSolarEnergyInternal(
                dayOfYear,
                halfHourSegment.HourStart,
                halfHourSegment.MinuteStart,
                context.WeatherData,
                context.DayInfo);
            
            // Return the result as a Kwh object
            return new Kwh(prediction);
        }
        
        // Renamed the original method to make it internal
        private float PredictSolarEnergyInternal(
            int dayOfYear,
            int hour,
            int minute,
            WeatherData weatherData,
            DayInfo dayInfo)
        {
            // Create a dictionary for all input features
            var allFeatures = new Dictionary<string, float>();

            // 1. Add the weather features using the dictionary conversion for compatibility
            var weatherDict = weatherData.ToDictionary();
            foreach (var item in weatherDict)
            {
                allFeatures[item.Key] = item.Value;
            }

            // 2. Add the day info features using the dictionary conversion for compatibility
            var dayInfoDict = dayInfo.ToDictionary();
            foreach (var item in dayInfoDict)
            {
                allFeatures[item.Key] = item.Value;
            }

            // 3. Add the time features
            allFeatures["hour"] = hour;
            allFeatures["minute"] = minute;
            // Calculate cyclical time features
            allFeatures["hour_sin"] = (float)Math.Sin(2 * Math.PI * hour / 24);
            allFeatures["hour_cos"] = (float)Math.Cos(2 * Math.PI * hour / 24);

            // For minute features, use the exact same calculation as in the Python code
            // This ensures consistency with how the model was trained
            allFeatures["minute_sin"] = (float)Math.Sin(2 * Math.PI * minute / 60);
            allFeatures["minute_cos"] = (float)Math.Cos(2 * Math.PI * minute / 60);

            // 4. Add the computed values for this day of year
            var dayValues = _computedValues.FirstOrDefault(d => d.day_of_year == dayOfYear);
            if (dayValues == null)
            {
                throw new ArgumentException($"No computed values found for day {dayOfYear}");
            }

            allFeatures["solar_declination"] = dayValues.solar_declination;
            allFeatures["max_solar_elevation"] = dayValues.max_solar_elevation;
            allFeatures["max_theoretical_radiation"] = dayValues.max_theoretical_radiation;

            // 5. Calculate total_radiation if needed
            if (Array.IndexOf(_scalingParams.feature_names, "total_radiation") >= 0 &&
                allFeatures.ContainsKey("diffuse_radiation (W/m²)") &&
                allFeatures.ContainsKey("direct_radiation (W/m²)"))
            {
                allFeatures["total_radiation"] =
                    allFeatures["diffuse_radiation (W/m²)"] +
                    allFeatures["direct_radiation (W/m²)"];
            }

            // 6. Calculate solar_quality if needed
            if (Array.IndexOf(_scalingParams.feature_names, "solar_quality") >= 0 &&
                allFeatures.ContainsKey("total_radiation") &&
                allFeatures.ContainsKey("max_theoretical_radiation") &&
                allFeatures["max_theoretical_radiation"] > 0)
            {
                allFeatures["solar_quality"] =
                    allFeatures["total_radiation"] /
                    allFeatures["max_theoretical_radiation"];
            }

            // Use the feature names directly from the scaling parameters
            string[] expectedFeatureNames = _scalingParams.feature_names;

            // Create the feature array using the expected feature names
            var features = new float[expectedFeatureNames.Length];

            for (int i = 0; i < expectedFeatureNames.Length; i++)
            {
                string featureName = expectedFeatureNames[i];

                if (allFeatures.ContainsKey(featureName))
                {
                    features[i] = allFeatures[featureName];
                }
                else
                {
                    Console.WriteLine($"Warning: Feature {featureName} not found in input data. Using 0.");
                    features[i] = 0; // Default value if not provided
                }
            }

            // Scale the features using our scaling parameters
            for (int i = 0; i < features.Length; i++)
            {
                features[i] = (features[i] - _scalingParams.mean[i]) / _scalingParams.scale[i];
            }

            // Get the input name from the model metadata
            string inputName = _session.InputMetadata.Keys.First();

            // Prepare input tensor for ONNX with the exact dimensions needed by the model
            var inputTensor = new DenseTensor<float>(new[] { 1, features.Length });

            // Copy our features to the input tensor
            for (int i = 0; i < features.Length; i++)
            {
                inputTensor[0, i] = features[i];
            }

            // Create input for inference
            var inputs = new List<NamedOnnxValue>
            {
                NamedOnnxValue.CreateFromTensor(inputName, inputTensor)
            };

            // Run inference
            using var results = _session.Run(inputs);

            // Get the output - find the first output tensor
            var outputTensor = results.FirstOrDefault()?.AsTensor<float>();
            float prediction = outputTensor != null ? outputTensor[0] : 0;

            // Ensure non-negative
            return Math.Max(0, prediction);
        }

        // For backward compatibility - now private
        private float PredictSolarEnergyInternal(
            int dayOfYear,
            int hour,
            int minute,
            Dictionary<string, float> weatherData,
            Dictionary<string, float> dayInfoData)
        {
            // Create a dictionary for all input features
            var allFeatures = new Dictionary<string, float>();

            // 1. Add the weather features
            foreach (var item in weatherData)
            {
                allFeatures[item.Key] = item.Value;
            }

            // 2. Add the day info features
            foreach (var item in dayInfoData)
            {
                allFeatures[item.Key] = item.Value;
            }

            // 3. Add the time features
            allFeatures["hour"] = hour;
            allFeatures["minute"] = minute;
            // Calculate cyclical time features
            allFeatures["hour_sin"] = (float)Math.Sin(2 * Math.PI * hour / 24);
            allFeatures["hour_cos"] = (float)Math.Cos(2 * Math.PI * hour / 24);

            // For minute features, use the exact same calculation as in the Python code
            // This ensures consistency with how the model was trained
            allFeatures["minute_sin"] = (float)Math.Sin(2 * Math.PI * minute / 60);
            allFeatures["minute_cos"] = (float)Math.Cos(2 * Math.PI * minute / 60);

            // 4. Add the computed values for this day of year
            var dayValues = _computedValues.FirstOrDefault(d => d.day_of_year == dayOfYear);
            if (dayValues == null)
            {
                throw new ArgumentException($"No computed values found for day {dayOfYear}");
            }

            allFeatures["solar_declination"] = dayValues.solar_declination;
            allFeatures["max_solar_elevation"] = dayValues.max_solar_elevation;
            allFeatures["max_theoretical_radiation"] = dayValues.max_theoretical_radiation;

            // 5. Calculate total_radiation if needed
            if (Array.IndexOf(_scalingParams.feature_names, "total_radiation") >= 0 &&
                allFeatures.ContainsKey("diffuse_radiation (W/m²)") &&
                allFeatures.ContainsKey("direct_radiation (W/m²)"))
            {
                allFeatures["total_radiation"] =
                    allFeatures["diffuse_radiation (W/m²)"] +
                    allFeatures["direct_radiation (W/m²)"];
            }

            // 6. Calculate solar_quality if needed
            if (Array.IndexOf(_scalingParams.feature_names, "solar_quality") >= 0 &&
                allFeatures.ContainsKey("total_radiation") &&
                allFeatures.ContainsKey("max_theoretical_radiation") &&
                allFeatures["max_theoretical_radiation"] > 0)
            {
                allFeatures["solar_quality"] =
                    allFeatures["total_radiation"] /
                    allFeatures["max_theoretical_radiation"];
            }

            // Use the feature names directly from the scaling parameters
            string[] expectedFeatureNames = _scalingParams.feature_names;

            // Create the feature array using the expected feature names
            var features = new float[expectedFeatureNames.Length];

            for (int i = 0; i < expectedFeatureNames.Length; i++)
            {
                string featureName = expectedFeatureNames[i];

                if (allFeatures.ContainsKey(featureName))
                {
                    features[i] = allFeatures[featureName];
                }
                else
                {
                    Console.WriteLine($"Warning: Feature {featureName} not found in input data. Using 0.");
                    features[i] = 0; // Default value if not provided
                }
            }

            // Scale the features using our scaling parameters
            for (int i = 0; i < features.Length; i++)
            {
                features[i] = (features[i] - _scalingParams.mean[i]) / _scalingParams.scale[i];
            }

            // Get the input name from the model metadata
            string inputName = _session.InputMetadata.Keys.First();

            // Prepare input tensor for ONNX with the exact dimensions needed by the model
            var inputTensor = new DenseTensor<float>(new[] { 1, features.Length });

            // Copy our features to the input tensor
            for (int i = 0; i < features.Length; i++)
            {
                inputTensor[0, i] = features[i];
            }

            // Create input for inference
            var inputs = new List<NamedOnnxValue>
            {
                NamedOnnxValue.CreateFromTensor(inputName, inputTensor)
            };

            // Run inference
            using var results = _session.Run(inputs);

            // Get the output - find the first output tensor
            var outputTensor = results.FirstOrDefault()?.AsTensor<float>();
            float prediction = outputTensor != null ? outputTensor[0] : 0;

            // Ensure non-negative
            return Math.Max(0, prediction);
        }

        public class ScalingParams
        {
            public string[] feature_names { get; set; }
            public float[] mean { get; set; }
            public float[] scale { get; set; }
        }

        public class ComputedValue
        {
            public int day_of_year { get; set; }
            public float solar_declination { get; set; }
            public float max_solar_elevation { get; set; }
            public float max_theoretical_radiation { get; set; }
        }
    }
}