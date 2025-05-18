using HouseSolarPredictor.Config;

namespace HouseSolarPredictor.EnergySupply.Octopus;

/// <summary>
/// Handles API key management and OctopusApiClient creation
/// </summary>
public class ApiKeyProvider
{
    /// <summary>
    /// Gets an OctopusApiClient with valid credentials
    /// </summary>
    /// <returns>An initialized OctopusApiClient</returns>
    /// <exception cref="InvalidOperationException">Thrown when valid credentials cannot be obtained</exception>
    public static OctopusApiClient GetOctopusClient()
    {
        // Check for stored credentials
        bool hasStoredCredentials = SecureCredentialStore.TryGetCredentials(
            out string apiKey, out string accountNumber, out string tariffCode, out string regionCode);
        
        if (hasStoredCredentials)
        {
            var useStoredCredentials = AskToUseStoredCredentials();
            
            if (useStoredCredentials)
            {
                return new OctopusApiClient(apiKey, accountNumber, tariffCode, regionCode);
            }
            
            // User wants to enter new credentials
            return GetClientWithNewCredentials();
        }
        
        // No stored credentials
        Console.WriteLine("No stored credentials found.");
        return GetClientWithNewCredentials();
    }
    
    /// <summary>
    /// Gets a client with new credentials entered by the user
    /// </summary>
    /// <exception cref="InvalidOperationException">Thrown when valid credentials cannot be obtained</exception>
    private static OctopusApiClient GetClientWithNewCredentials()
    {
        string apiKey = GetApiKeyFromUser();
        string accountNumber = GetAccountNumberFromUser();
        
        if (string.IsNullOrWhiteSpace(apiKey) || string.IsNullOrWhiteSpace(accountNumber))
        {
            throw new InvalidOperationException("API key and account number are required.");
        }
        
        // Create client with new credentials
        var client = new OctopusApiClient(apiKey, accountNumber);
        
        if (AskToSaveCredentials())
        {
            try
            {
                SecureCredentialStore.SaveCredentials(apiKey, accountNumber);
                Console.WriteLine("Credentials saved securely.");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to save credentials: {ex.Message}");
            }
        }
        
        return client;
    }
    
    /// <summary>
    /// Asks the user if they want to use stored credentials
    /// </summary>
    private static bool AskToUseStoredCredentials()
    {
        Console.WriteLine("Found stored Octopus API credentials.");
        Console.Write("Would you like to use stored credentials (Y) or enter new ones (N)? [Y/N]: ");
        
        string choice = Console.ReadLine()?.Trim().ToUpper() ?? "Y";
        
        return choice != "N"; // Default to using stored credentials
    }
    
    /// <summary>
    /// Gets the API key from the user
    /// </summary>
    private static string GetApiKeyFromUser()
    {
        Console.Write("Enter Octopus API key: ");
        return Console.ReadLine()?.Trim() ?? string.Empty;
    }
    
    /// <summary>
    /// Gets the account number from the user
    /// </summary>
    private static string GetAccountNumberFromUser()
    {
        Console.Write("Enter Octopus account number: ");
        return Console.ReadLine()?.Trim() ?? string.Empty;
    }
    
    /// <summary>
    /// Asks the user if they want to save the credentials
    /// </summary>
    private static bool AskToSaveCredentials()
    {
        Console.Write("Save these credentials for future use? [Y/N]: ");
        string saveChoice = Console.ReadLine()?.Trim().ToUpper() ?? "N";
        
        return saveChoice == "Y";
    }
}