using System.Security.Cryptography;
using System.Text;

namespace HouseSolarPredictor.Config;

public class SecureCredentialStore
{
    private const string OctopusApiKeyFileName = "octopus_api_key.dat";
    private const string OctopusAccountNumberFileName = "octopus_account_number.dat";
    private const string OctopusTariffCodeFileName = "octopus_tariff_code.dat";
    private const string OctopusRegionCodeFileName = "octopus_region_code.dat";
    private static readonly byte[] _entropy = Encoding.UTF8.GetBytes("HouseSolarPredictorEntropy");
        
    private static string GetFilePath(string fileName)
    {
        string appDataPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "HouseSolarPredictor");
                
        // Create directory if it doesn't exist
        if (!Directory.Exists(appDataPath))
        {
            Directory.CreateDirectory(appDataPath);
        }
            
        return Path.Combine(appDataPath, fileName);
    }
        
    public static void SaveCredentials(string apiKey, string accountNumber, string tariffCode = null, string regionCode = null)
    {
        if (string.IsNullOrEmpty(apiKey) || string.IsNullOrEmpty(accountNumber))
        {
            throw new ArgumentException("API key and account number cannot be empty");
        }
            
        // Encrypt and save API key
        byte[] encryptedApiKey = ProtectedData.Protect(
            Encoding.UTF8.GetBytes(apiKey),
            _entropy,
            DataProtectionScope.CurrentUser);
                
        File.WriteAllBytes(GetFilePath(OctopusApiKeyFileName), encryptedApiKey);
            
        // Encrypt and save account number
        byte[] encryptedAccountNumber = ProtectedData.Protect(
            Encoding.UTF8.GetBytes(accountNumber),
            _entropy,
            DataProtectionScope.CurrentUser);
                
        File.WriteAllBytes(GetFilePath(OctopusAccountNumberFileName), encryptedAccountNumber);
        
        // Save tariff code if provided
        if (!string.IsNullOrEmpty(tariffCode))
        {
            byte[] encryptedTariffCode = ProtectedData.Protect(
                Encoding.UTF8.GetBytes(tariffCode),
                _entropy,
                DataProtectionScope.CurrentUser);
                    
            File.WriteAllBytes(GetFilePath(OctopusTariffCodeFileName), encryptedTariffCode);
        }
        
        // Save region code if provided
        if (!string.IsNullOrEmpty(regionCode))
        {
            byte[] encryptedRegionCode = ProtectedData.Protect(
                Encoding.UTF8.GetBytes(regionCode),
                _entropy,
                DataProtectionScope.CurrentUser);
                    
            File.WriteAllBytes(GetFilePath(OctopusRegionCodeFileName), encryptedRegionCode);
        }
    }
        
    public static bool TryGetCredentials(out string apiKey, out string accountNumber, out string tariffCode, out string regionCode)
    {
        apiKey = null;
        accountNumber = null;
        tariffCode = null;
        regionCode = null;
            
        try
        {
            string apiKeyPath = GetFilePath(OctopusApiKeyFileName);
            string accountNumberPath = GetFilePath(OctopusAccountNumberFileName);
                
            // Check if both required files exist
            if (!File.Exists(apiKeyPath) || !File.Exists(accountNumberPath))
            {
                return false;
            }
                
            // Decrypt API key
            byte[] encryptedApiKey = File.ReadAllBytes(apiKeyPath);
            byte[] decryptedApiKey = ProtectedData.Unprotect(
                encryptedApiKey,
                _entropy,
                DataProtectionScope.CurrentUser);
                    
            apiKey = Encoding.UTF8.GetString(decryptedApiKey);
                
            // Decrypt account number
            byte[] encryptedAccountNumber = File.ReadAllBytes(accountNumberPath);
            byte[] decryptedAccountNumber = ProtectedData.Unprotect(
                encryptedAccountNumber,
                _entropy,
                DataProtectionScope.CurrentUser);
                    
            accountNumber = Encoding.UTF8.GetString(decryptedAccountNumber);
            
            // Try to get tariff code if it exists
            string tariffCodePath = GetFilePath(OctopusTariffCodeFileName);
            if (File.Exists(tariffCodePath))
            {
                byte[] encryptedTariffCode = File.ReadAllBytes(tariffCodePath);
                byte[] decryptedTariffCode = ProtectedData.Unprotect(
                    encryptedTariffCode,
                    _entropy,
                    DataProtectionScope.CurrentUser);
                        
                tariffCode = Encoding.UTF8.GetString(decryptedTariffCode);
            }
            
            // Try to get region code if it exists
            string regionCodePath = GetFilePath(OctopusRegionCodeFileName);
            if (File.Exists(regionCodePath))
            {
                byte[] encryptedRegionCode = File.ReadAllBytes(regionCodePath);
                byte[] decryptedRegionCode = ProtectedData.Unprotect(
                    encryptedRegionCode,
                    _entropy,
                    DataProtectionScope.CurrentUser);
                        
                regionCode = Encoding.UTF8.GetString(decryptedRegionCode);
            }
                
            return true;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error retrieving credentials: {ex.Message}");
            return false;
        }
    }
    
    // Backward compatibility method
    public static bool TryGetCredentials(out string apiKey, out string accountNumber)
    {
        string tariffCode, regionCode;
        return TryGetCredentials(out apiKey, out accountNumber, out tariffCode, out regionCode);
    }
        
    public static void DeleteCredentials()
    {
        try
        {
            string apiKeyPath = GetFilePath(OctopusApiKeyFileName);
            string accountNumberPath = GetFilePath(OctopusAccountNumberFileName);
            string tariffCodePath = GetFilePath(OctopusTariffCodeFileName);
            string regionCodePath = GetFilePath(OctopusRegionCodeFileName);
                
            if (File.Exists(apiKeyPath))
            {
                File.Delete(apiKeyPath);
            }
                
            if (File.Exists(accountNumberPath))
            {
                File.Delete(accountNumberPath);
            }
            
            if (File.Exists(tariffCodePath))
            {
                File.Delete(tariffCodePath);
            }
            
            if (File.Exists(regionCodePath))
            {
                File.Delete(regionCodePath);
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error deleting credentials: {ex.Message}");
        }
    }
}