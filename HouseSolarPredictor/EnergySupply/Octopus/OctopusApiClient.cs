using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using HouseSolarPredictor.Load;
using HouseSolarPredictor.Prediction;

namespace HouseSolarPredictor.EnergySupply.Octopus;

// Model classes for API responses

public class OctopusApiClient
{
    private readonly HttpClient _httpClient;
    private readonly string _apiKey;
    private readonly string _accountNumber;
    private string _tariffCode;
    private string _regionCode;
    private string _mpan;
    private string _meterSerialNumber;

    // Base URL for the Octopus Energy API
    private const string API_BASE_URL = "https://api.octopus.energy/v1/";

    // Default tariff and region if none specified

    /// <summary>
    /// Initializes a new instance of the OctopusApiClient
    /// </summary>
    /// <param name="apiKey">The Octopus API key</param>
    /// <param name="accountNumber">The Octopus account number</param>
    /// <param name="tariffCode">Optional tariff code (will be auto-detected if null)</param>
    /// <param name="regionCode">Optional region code (will be auto-detected if null)</param>
    public OctopusApiClient(string apiKey, string accountNumber, string tariffCode = null, string regionCode = null)
    {
        _apiKey = apiKey;
        _accountNumber = accountNumber;

        _httpClient = new HttpClient();

        // Set up the authentication
        var byteArray = Encoding.ASCII.GetBytes($"{_apiKey}:");
        _httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Basic", Convert.ToBase64String(byteArray));

        // Initialize tariff and region information
        InitializeAccountInfoAsync().GetAwaiter().GetResult();

        // Override with provided values if specified
        if (!string.IsNullOrEmpty(tariffCode))
        {
            _tariffCode = tariffCode;
        }

        if (!string.IsNullOrEmpty(regionCode))
        {
            _regionCode = regionCode;
        }
    }
    
    /// <summary>
    /// Extracts the product code from an Octopus Energy tariff code.
    /// </summary>
    /// <param name="tariffCode">The full tariff code (e.g., "E-1R-AGILE-BB-24-10-01-J")</param>
    /// <returns>The extracted product code (e.g., "AGILE-BB-24-10-01")</returns>
    public static string ExtractProductCodeFromTariff(string tariffCode)
    {
        if (string.IsNullOrEmpty(tariffCode))
            return string.Empty;
    
        // Split the tariff code by hyphens
        string[] parts = tariffCode.Split('-');
    
        // Check if we have enough parts for a valid tariff code
        if (parts.Length < 5)
            return string.Empty;
    
        // Find the index where "AGILE" starts
        int agileIndex = -1;
        for (int i = 0; i < parts.Length; i++)
        {
            if (parts[i] == "AGILE")
            {
                agileIndex = i;
                break;
            }
        }
    
        if (agileIndex == -1)
            throw new ArgumentException("Invalid tariff code format: 'AGILE' not found");
    
        // The product code starts with "AGILE" and goes up to but not including the region code
        // We need to join the relevant parts with hyphens
        string productCode = string.Join("-", parts, agileIndex, parts.Length - agileIndex - 1);
    
        return productCode;
    }
    /// <summary>
    /// Gets the current tariff code
    /// </summary>
    public string TariffCode => _tariffCode;

    /// <summary>
    /// Gets the current region code
    /// </summary>
    public string RegionCode => _regionCode;

    /// <summary>
    /// Sets the tariff and region codes
    /// </summary>
    public void SetTariffAndRegion(string tariffCode, string regionCode)
    {
        _tariffCode = tariffCode;
        _regionCode = regionCode;
    }

    /// <summary>
    /// Initializes account information by retrieving it from the Octopus API
    /// </summary>
    private async Task InitializeAccountInfoAsync()
    {
        // Get account information
        var accountInfo = await GetAccountInfoAsync();
        ExtractAccountInformation(accountInfo);
    }

    /// <summary>
    /// Gets account information from the Octopus API
    /// </summary>
    private async Task<OctopusAccountResponse> GetAccountInfoAsync()
    {
        // Construct API URL for account information
        string apiUrl = $"{API_BASE_URL}accounts/{_accountNumber}/";
        
        Console.WriteLine($"Making API request to URL {apiUrl}");
        HttpResponseMessage response = await _httpClient.GetAsync(apiUrl);
        response.EnsureSuccessStatusCode();
        string responseBody = await response.Content.ReadAsStringAsync();

        return JsonSerializer.Deserialize<OctopusAccountResponse>(responseBody, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });
    }

    /// <summary>
    /// Extracts tariff and region information from account information
    /// </summary>
    private void ExtractAccountInformation(OctopusAccountResponse accountInfo)
    {
        if (accountInfo?.Properties == null || !accountInfo.Properties.Any())
            return;

        var property = accountInfo.Properties[0];
        
        if (property.ElectricityMeterPoints == null || !property.ElectricityMeterPoints.Any())
            return;
            
        var meterPoint = property.ElectricityMeterPoints[0];
        
        // Extract MPAN
        _mpan = meterPoint.Mpan;
        
        // Extract region code from MPAN (first two digits)
        if (!string.IsNullOrEmpty(_mpan) && _mpan.Length >= 2)
        {
            string mpanPrefix = _mpan.Substring(0, 2);
            _regionCode = MapMpanPrefixToRegionCode(mpanPrefix);
        }
        
        // Extract meter serial number
        if (meterPoint.Meters != null && meterPoint.Meters.Any())
        {
            _meterSerialNumber = meterPoint.Meters[0].SerialNumber;
        }
        
        // Extract agreements (tariffs)
        if (meterPoint.Agreements != null && meterPoint.Agreements.Any())
        {
            // Find the current agreement (tariff)
            DateTime now = DateTime.UtcNow;
            foreach (var agreement in meterPoint.Agreements)
            {
                DateTime validFrom = DateTime.Parse(agreement.ValidFrom);
                bool isCurrentTariff = agreement.ValidTo == null ||
                                      (DateTime.TryParse(agreement.ValidTo, out DateTime validTo) && validTo > now);
                
                if (isCurrentTariff)
                {
                    _tariffCode = agreement.TariffCode;
                    break;
                }
            }
        }

        Console.WriteLine($"Using tariff: {_tariffCode} in region: {_regionCode}");
    }

    /// <summary>
    /// Maps MPAN prefix to region code
    /// </summary>
    private string MapMpanPrefixToRegionCode(string mpanPrefix)
    {
        // Map MPAN prefix to region code based on the documentation
        switch (mpanPrefix)
        {
            case "10": return "A"; // Eastern England
            case "11": return "B"; // East Midlands
            case "12": return "C"; // London
            case "13": return "D"; // Merseyside and Northern Wales
            case "14": return "E"; // West Midlands
            case "15": return "F"; // North Eastern England
            case "16": return "G"; // North Western England
            case "17": return "H"; // Southern England
            case "18": return "J"; // South Eastern England
            case "19": return "K"; // Southern Wales
            case "20": return "L"; // South Western England
            case "21": return "M"; // Yorkshire
            case "22": return "N"; // Southern Scotland
            case "23": return "P"; // Northern Scotland
            default: throw new ArgumentException($"Unknown MPAN prefix: {mpanPrefix}");
        }
    }

    /// <summary>
    /// Helper method to make API requests with detailed error information
    /// </summary>
    private async Task<T> MakeApiRequestAsync<T>(string url, string requestDescription)
    {
        Console.WriteLine($"Making API request to {requestDescription}: {url}");
        
        HttpResponseMessage response = await _httpClient.GetAsync(url);
        string responseBody = await response.Content.ReadAsStringAsync();
        
        if (!response.IsSuccessStatusCode)
        {
            throw new HttpRequestException(
                $"API request to {requestDescription} failed with status code {response.StatusCode}. " +
                $"URL: {url}, Response: {responseBody}");
        }
        
        return JsonSerializer.Deserialize<T>(responseBody, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });
    }

    /// <summary>
    /// Gets available tariffs from Octopus API
    /// </summary>
    public async Task<List<(string Code, string Name, string Description)>> GetAvailableTariffsAsync()
    {
        // Construct API URL for products
        string apiUrl = $"{API_BASE_URL}products/";

        var tariffs = new List<(string Code, string Name, string Description)>();
        string nextUrl = apiUrl;

        while (!string.IsNullOrEmpty(nextUrl))
        {
            // Make the API request
            var productsResponse = await MakeApiRequestAsync<OctopusProductsResponse>(nextUrl, "products");

            if (productsResponse?.Results != null)
            {
                foreach (var product in productsResponse.Results)
                {
                    tariffs.Add((product.Code, product.DisplayName, product.Description ?? ""));
                }
            }

            // Check if we need to get more pages
            nextUrl = productsResponse?.Next;
        }

        return tariffs;
    }

    public async Task<List<EnergyPrice>> GetElectricityPricesAsync(DateTime fromDate, DateTime toDate)
    {
        string fromDateStr = fromDate.ToString("yyyy-MM-ddTHH:mm:ssZ");
        string toDateStr = toDate.ToString("yyyy-MM-ddTHH:mm:ssZ");

        // Extract product code from tariff code
        string productCode = ExtractProductCodeFromTariff(_tariffCode);
        if (string.IsNullOrEmpty(productCode))
        {
            throw new ArgumentException("Invalid tariff code format. Unable to extract product code.");
        }
        // Construct API URL for electricity prices
        string apiUrl =
            $"{API_BASE_URL}products/{productCode}/electricity-tariffs/{_tariffCode}/standard-unit-rates/?period_from={fromDateStr}&period_to={toDateStr}&page_size=1500";

        // Make the API request
        var pricesResponse = await MakeApiRequestAsync<OctopusPricesResponse>(apiUrl, "electricity prices");

        var prices = new List<EnergyPrice>();

        if (pricesResponse?.Results != null)
        {
            foreach (var result in pricesResponse.Results)
            {
                if (DateTime.TryParse(result.ValidFrom, out DateTime validFrom) &&
                    DateTime.TryParse(result.ValidTo, out DateTime validTo))
                {
                    prices.Add(new EnergyPrice
                    {
                        ValidFrom = validFrom,
                        ValidTo = validTo,
                        PricePerKwh = new Gbp(result.ValueIncVat / 100m) // Convert from pence to pounds
                    });
                }
            }
        }

        // Sort by time
        prices.Sort((a, b) => a.ValidFrom.CompareTo(b.ValidFrom));

        return prices;
    }

    // Method to fetch consumption data if needed
    public async Task<List<EnergyConsumption>> GetElectricityConsumptionAsync(DateTime fromDate, DateTime toDate)
    {
        // Format the dates for the API
        string fromDateStr = fromDate.ToString("yyyy-MM-ddTHH:mm:ssZ");
        string toDateStr = toDate.ToString("yyyy-MM-ddTHH:mm:ssZ");

        // Check if we have MPAN and meter serial number
        if (string.IsNullOrEmpty(_mpan) || string.IsNullOrEmpty(_meterSerialNumber))
        {
            // Try to initialize account info if we don't have MPAN and meter serial number
            await InitializeAccountInfoAsync();

            // If still missing, use the account number as fallback
            if (string.IsNullOrEmpty(_mpan) || string.IsNullOrEmpty(_meterSerialNumber))
            {
                // Construct API URL for electricity consumption using account number (legacy approach)
                string apiUrl =
                    $"{API_BASE_URL}electricity-meter-points/{_accountNumber}/meters/consumption/?period_from={fromDateStr}&period_to={toDateStr}&page_size=25000&order_by=period";
                return await FetchConsumptionDataAsync(apiUrl);
            }
        }

        // Construct API URL for electricity consumption using MPAN and meter serial number
        string mpanApiUrl =
            $"{API_BASE_URL}electricity-meter-points/{_mpan}/meters/{_meterSerialNumber}/consumption/?period_from={fromDateStr}&period_to={toDateStr}&page_size=25000&order_by=period";
        return await FetchConsumptionDataAsync(mpanApiUrl);
    }

    /// <summary>
    /// Fetches consumption data from the specified API URL
    /// </summary>
    private async Task<List<EnergyConsumption>> FetchConsumptionDataAsync(string apiUrl)
    {
        var consumptions = new List<EnergyConsumption>();
        string nextUrl = apiUrl;

        while (!string.IsNullOrEmpty(nextUrl))
        {
            // Make the API request
            var consumptionResponse = await MakeApiRequestAsync<OctopusConsumptionResponse>(nextUrl, "consumption data");

            if (consumptionResponse?.Results != null)
            {
                foreach (var result in consumptionResponse.Results)
                {
                    if (DateTime.TryParse(result.IntervalStart, out DateTime intervalStart) &&
                        DateTime.TryParse(result.IntervalEnd, out DateTime intervalEnd))
                    {
                        consumptions.Add(new EnergyConsumption
                        {
                            IntervalStart = intervalStart,
                            IntervalEnd = intervalEnd,
                            ConsumptionKwh = result.ConsumptionValue
                        });
                    }
                }
            }

            // Check if we need to get more pages
            nextUrl = consumptionResponse?.Next;
        }

        // Sort by time
        consumptions.Sort((a, b) => a.IntervalStart.CompareTo(b.IntervalStart));

        return consumptions;
    }

    /// <summary>
    /// Gets historical consumption data for load prediction
    /// </summary>
    /// <param name="targetDate">The date for which to predict load</param>
    /// <returns>Dictionary mapping timestamps to consumption values</returns>
    public async Task<Dictionary<DateTime, float>> GetHistoricalConsumptionForPredictionAsync(DateTime targetDate)
    {
        Console.WriteLine("Fetching historical consumption data from Octopus API for load prediction...");

        var historicalConsumption = new Dictionary<DateTime, float>();

        // Get previous day's consumption
        DateTime previousDay = targetDate.AddDays(-1);
        var previousDayConsumption = await GetElectricityConsumptionAsync(
            previousDay, previousDay.AddDays(1));

        // Get previous week's consumption
        DateTime previousWeek = targetDate.AddDays(-7);
        var previousWeekConsumption = await GetElectricityConsumptionAsync(
            previousWeek, previousWeek.AddDays(1));

        // Store consumption data in the dictionary
        foreach (var consumption in previousDayConsumption)
        {
            // Use the start time of the interval as the key
            historicalConsumption[consumption.IntervalStart] = consumption.ConsumptionKwh;
        }

        foreach (var consumption in previousWeekConsumption)
        {
            // For previous week data, adjust the date to match the target date's day
            DateTime adjustedTime = new DateTime(
                targetDate.Year,
                targetDate.Month,
                targetDate.Day,
                consumption.IntervalStart.Hour,
                consumption.IntervalStart.Minute,
                0).AddDays(-7);

            historicalConsumption[adjustedTime] = consumption.ConsumptionKwh;
        }

        Console.WriteLine($"Fetched {previousDayConsumption.Count} consumption points for previous day");
        Console.WriteLine($"Fetched {previousWeekConsumption.Count} consumption points for previous week");

        return historicalConsumption;
    }
}