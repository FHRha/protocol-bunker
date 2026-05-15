using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using ProtocolBunker.Desktop.Contracts.Models;
using ProtocolBunker.Desktop.Contracts.Services;

namespace ProtocolBunker.Desktop.Infrastructure.Services;

public sealed class DesktopAiAccessKeyService : IAiAccessKeyService
{
    private const string AccessKeysFileName = "ai-access-keys.json";
    private const string AiAccessKeyScope = "ai_bots";
    private readonly SemaphoreSlim _ioLock = new(1, 1);

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = true,
    };

    public async Task<AiAccessKeyListResult> ListAsync(DesktopSettingsModel settings, CancellationToken cancellationToken = default)
    {
        var filePath = ResolveAccessKeysFile(settings);
        var store = await ReadStoreAsync(filePath, cancellationToken);
        return new AiAccessKeyListResult(true, "AI access keys loaded.", filePath, store.Keys.Select(ToPublicModel).ToList());
    }

    public async Task<AiAccessKeyCreateResult> CreateAsync(DesktopSettingsModel settings, string label, CancellationToken cancellationToken = default)
    {
        var filePath = ResolveAccessKeysFile(settings);
        await _ioLock.WaitAsync(cancellationToken);
        try
        {
            var store = await ReadStoreUnlockedAsync(filePath, cancellationToken);
            var id = Base64Url(RandomNumberGenerator.GetBytes(8));
            var secret = Base64Url(RandomNumberGenerator.GetBytes(32));
            var key = $"pbai_{id}_{secret}";
            var record = new AiAccessKeyStoreRecord
            {
                Id = id,
                Label = NormalizeLabel(label),
                Scopes = [AiAccessKeyScope],
                KeyHash = HashKey(key),
                CreatedAt = DateTimeOffset.UtcNow.ToString("O"),
            };

            store.Keys.Add(record);
            await WriteStoreUnlockedAsync(filePath, store, cancellationToken);
            return new AiAccessKeyCreateResult(true, "AI access key created.", filePath, key, ToPublicModel(record));
        }
        finally
        {
            _ioLock.Release();
        }
    }

    public async Task<AiAccessKeyActionResult> UpdateLabelAsync(DesktopSettingsModel settings, string id, string label, CancellationToken cancellationToken = default)
    {
        var filePath = ResolveAccessKeysFile(settings);
        await _ioLock.WaitAsync(cancellationToken);
        try
        {
            var store = await ReadStoreUnlockedAsync(filePath, cancellationToken);
            var record = store.Keys.FirstOrDefault(item => item.Id == id);
            if (record is null)
            {
                return new AiAccessKeyActionResult(false, "AI access key was not found.", filePath, null);
            }

            record.Label = NormalizeLabel(label);
            await WriteStoreUnlockedAsync(filePath, store, cancellationToken);
            return new AiAccessKeyActionResult(true, "AI access key label updated.", filePath, ToPublicModel(record));
        }
        finally
        {
            _ioLock.Release();
        }
    }

    public async Task<AiAccessKeyActionResult> RevokeAsync(DesktopSettingsModel settings, string id, CancellationToken cancellationToken = default)
    {
        var filePath = ResolveAccessKeysFile(settings);
        await _ioLock.WaitAsync(cancellationToken);
        try
        {
            var store = await ReadStoreUnlockedAsync(filePath, cancellationToken);
            var record = store.Keys.FirstOrDefault(item => item.Id == id);
            if (record is null)
            {
                return new AiAccessKeyActionResult(false, "AI access key was not found.", filePath, null);
            }

            record.RevokedAt ??= DateTimeOffset.UtcNow.ToString("O");
            await WriteStoreUnlockedAsync(filePath, store, cancellationToken);
            return new AiAccessKeyActionResult(true, "AI access key revoked.", filePath, ToPublicModel(record));
        }
        finally
        {
            _ioLock.Release();
        }
    }

    public async Task<AiAccessKeyActionResult> DeleteAsync(DesktopSettingsModel settings, string id, CancellationToken cancellationToken = default)
    {
        var filePath = ResolveAccessKeysFile(settings);
        await _ioLock.WaitAsync(cancellationToken);
        try
        {
            var store = await ReadStoreUnlockedAsync(filePath, cancellationToken);
            var removed = store.Keys.RemoveAll(item => item.Id == id) > 0;
            if (!removed)
            {
                return new AiAccessKeyActionResult(false, "AI access key was not found.", filePath, null);
            }

            await WriteStoreUnlockedAsync(filePath, store, cancellationToken);
            return new AiAccessKeyActionResult(true, "AI access key deleted.", filePath, null);
        }
        finally
        {
            _ioLock.Release();
        }
    }

    public async Task<AiAccessKeyValidationResult> ValidateAsync(DesktopSettingsModel settings, string key, CancellationToken cancellationToken = default)
    {
        var filePath = ResolveAccessKeysFile(settings);
        var normalized = (key ?? string.Empty).Trim();
        if (normalized.Length == 0)
        {
            return new AiAccessKeyValidationResult(true, "AI access key is not valid.", filePath, false, null);
        }

        var store = await ReadStoreAsync(filePath, cancellationToken);
        var keyHash = HashKey(normalized);
        var record = store.Keys.FirstOrDefault(item =>
            item.RevokedAt is null &&
            item.Scopes.Contains(AiAccessKeyScope) &&
            FixedTimeEquals(item.KeyHash, keyHash));

        return new AiAccessKeyValidationResult(
            true,
            record is null ? "AI access key is not valid." : "AI access key is valid.",
            filePath,
            record is not null,
            record is null ? null : ToPublicModel(record));
    }

    public static string ResolveAccessKeysFile(DesktopSettingsModel settings)
    {
        var appBaseDir = Path.GetFullPath(AppContext.BaseDirectory);
        var repoRoot = FindRepoRoot(appBaseDir);
        var baseDir = repoRoot ?? appBaseDir;
        var dataDir = ResolveDataDir(settings, baseDir);
        return Path.Combine(dataDir, AccessKeysFileName);
    }

    private async Task<AiAccessKeyStoreFile> ReadStoreAsync(string filePath, CancellationToken cancellationToken)
    {
        await _ioLock.WaitAsync(cancellationToken);
        try
        {
            return await ReadStoreUnlockedAsync(filePath, cancellationToken);
        }
        finally
        {
            _ioLock.Release();
        }
    }

    private static async Task<AiAccessKeyStoreFile> ReadStoreUnlockedAsync(string filePath, CancellationToken cancellationToken)
    {
        if (!File.Exists(filePath))
        {
            return new AiAccessKeyStoreFile();
        }

        await using var stream = File.OpenRead(filePath);
        var store = await JsonSerializer.DeserializeAsync<AiAccessKeyStoreFile>(stream, JsonOptions, cancellationToken);
        if (store?.Version != 1 || store.Keys is null)
        {
            throw new InvalidOperationException($"Unsupported AI access key store format: {filePath}");
        }

        store.Keys = store.Keys
            .Where(record => !string.IsNullOrWhiteSpace(record.Id) &&
                             !string.IsNullOrWhiteSpace(record.KeyHash) &&
                             !string.IsNullOrWhiteSpace(record.CreatedAt))
            .ToList();
        return store;
    }

    private static async Task WriteStoreUnlockedAsync(string filePath, AiAccessKeyStoreFile store, CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(filePath)!);
        var tmpPath = $"{filePath}.{Environment.ProcessId}.tmp";
        await using (var stream = File.Create(tmpPath))
        {
            await JsonSerializer.SerializeAsync(stream, store, JsonOptions, cancellationToken);
            await stream.WriteAsync(Encoding.UTF8.GetBytes(Environment.NewLine), cancellationToken);
        }

        File.Move(tmpPath, filePath, overwrite: true);
    }

    private static AiAccessKeyRecordModel ToPublicModel(AiAccessKeyStoreRecord record)
    {
        return new AiAccessKeyRecordModel(
            Id: record.Id,
            Label: record.Label ?? string.Empty,
            Scopes: string.Join(", ", record.Scopes),
            CreatedAt: record.CreatedAt,
            LastUsedAt: record.LastUsedAt ?? string.Empty,
            RevokedAt: record.RevokedAt ?? string.Empty,
            IsRevoked: !string.IsNullOrWhiteSpace(record.RevokedAt));
    }

    private static string? NormalizeLabel(string? label)
    {
        var trimmed = (label ?? string.Empty).Trim();
        return trimmed.Length == 0 ? null : trimmed[..Math.Min(trimmed.Length, 80)];
    }

    private static string HashKey(string key)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(key));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    private static bool FixedTimeEquals(string left, string right)
    {
        try
        {
            var leftBytes = Convert.FromHexString(left);
            var rightBytes = Convert.FromHexString(right);
            return leftBytes.Length == rightBytes.Length && CryptographicOperations.FixedTimeEquals(leftBytes, rightBytes);
        }
        catch
        {
            return false;
        }
    }

    private static string Base64Url(byte[] bytes)
    {
        return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    private static string ResolveDataDir(DesktopSettingsModel settings, string baseDir)
    {
        var raw = string.IsNullOrWhiteSpace(settings.DataFolder) ? "app/data" : settings.DataFolder.Trim();
        return Path.GetFullPath(Path.IsPathRooted(raw) ? raw : Path.Combine(baseDir, raw));
    }

    private static string? FindRepoRoot(string startDir)
    {
        var current = new DirectoryInfo(startDir);
        while (current is not null)
        {
            var packageJsonPath = Path.Combine(current.FullName, "package.json");
            var solutionPath = Path.Combine(current.FullName, "Protocol_Bunker.sln");
            if (File.Exists(packageJsonPath) && File.Exists(solutionPath))
            {
                return current.FullName;
            }

            current = current.Parent;
        }

        return null;
    }

    private sealed class AiAccessKeyStoreFile
    {
        public int Version { get; set; } = 1;

        public List<AiAccessKeyStoreRecord> Keys { get; set; } = [];
    }

    private sealed class AiAccessKeyStoreRecord
    {
        public string Id { get; set; } = string.Empty;

        public string? Label { get; set; }

        public List<string> Scopes { get; set; } = [];

        public string KeyHash { get; set; } = string.Empty;

        public string CreatedAt { get; set; } = string.Empty;

        public string? LastUsedAt { get; set; }

        public string? RevokedAt { get; set; }
    }
}
