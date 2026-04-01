using System.Text.Json;
using ProtocolBunker.Desktop.Contracts.Models;
using ProtocolBunker.Desktop.Contracts.Services;

namespace ProtocolBunker.Desktop.Infrastructure.Services;

public sealed class FileDesktopSettingsService : IDesktopSettingsService
{
    private const int DefaultPort = 8080;
    private readonly SemaphoreSlim _ioLock = new(1, 1);

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented = true,
    };

    public async Task<DesktopSettingsModel> LoadAsync(CancellationToken cancellationToken = default)
    {
        await _ioLock.WaitAsync(cancellationToken);
        try
        {
            var appBaseDir = Path.GetFullPath(AppContext.BaseDirectory);
            var repoRoot = FindRepoRoot(appBaseDir);

            var candidates = BuildCandidateSettingsPaths(appBaseDir, repoRoot);
            foreach (var path in candidates)
            {
                var loaded = await TryLoadLauncherSettingsAsync(path, cancellationToken);
                if (loaded is not null)
                {
                    return loaded;
                }
            }

            var portableCandidates = BuildCandidatePortableEnvPaths(appBaseDir, repoRoot);
            foreach (var path in portableCandidates)
            {
                var loaded = await TryLoadPortableEnvAsync(path, cancellationToken);
                if (loaded is not null)
                {
                    return loaded;
                }
            }

            return new DesktopSettingsModel(
                Language: "auto",
                Mode: "local",
                Port: DefaultPort,
                PublicHost: string.Empty,
                Domain: string.Empty,
                DataFolder: repoRoot is null ? "app/data" : Path.Combine(repoRoot, ".tmp-desktop-data"),
                RoomCode: string.Empty,
                DeveloperMode: false,
                HostToken: string.Empty,
                ViewToken: string.Empty,
                EditToken: string.Empty);
        }
        finally
        {
            _ioLock.Release();
        }
    }

    public async Task SaveAsync(DesktopSettingsModel settings, CancellationToken cancellationToken = default)
    {
        await _ioLock.WaitAsync(cancellationToken);
        try
        {
            var appBaseDir = Path.GetFullPath(AppContext.BaseDirectory);
            var repoRoot = FindRepoRoot(appBaseDir);
            var targetPath = ResolveWriteTargetPath(appBaseDir, repoRoot);

            var directory = Path.GetDirectoryName(targetPath);
            if (!string.IsNullOrWhiteSpace(directory))
            {
                Directory.CreateDirectory(directory);
            }

            var payload = new LauncherSettingsPayload
            {
                Language = NormalizeLanguage(settings.Language),
                Mode = NormalizeMode(settings.Mode),
                Port = NormalizePort(settings.Port),
                PublicHost = settings.PublicHost?.Trim() ?? string.Empty,
                Domain = settings.Domain?.Trim() ?? string.Empty,
                DataFolder = string.IsNullOrWhiteSpace(settings.DataFolder) ? "app/data" : settings.DataFolder.Trim(),
                RoomCode = settings.RoomCode?.Trim() ?? string.Empty,
                DevMode = settings.DeveloperMode,
                HostToken = settings.HostToken?.Trim() ?? string.Empty,
                ViewToken = settings.ViewToken?.Trim() ?? string.Empty,
                EditToken = settings.EditToken?.Trim() ?? string.Empty,
            };

            await using var stream = File.Create(targetPath);
            await JsonSerializer.SerializeAsync(stream, payload, JsonOptions, cancellationToken);
        }
        finally
        {
            _ioLock.Release();
        }
    }

    private static IEnumerable<string> BuildCandidateSettingsPaths(string appBaseDir, string? repoRoot)
    {
        yield return Path.Combine(appBaseDir, "launcher.settings.json");

        if (repoRoot is not null)
        {
            yield return Path.Combine(repoRoot, "launcher.settings.json");
            yield return Path.Combine(repoRoot, "artifacts", "win-desktop", "Protocol-Bunker", "launcher.settings.json");
        }
    }

    private static IEnumerable<string> BuildCandidatePortableEnvPaths(string appBaseDir, string? repoRoot)
    {
        yield return Path.Combine(appBaseDir, "app", "portable.env");

        if (repoRoot is not null)
        {
            yield return Path.Combine(repoRoot, "app", "portable.env");
            yield return Path.Combine(repoRoot, "artifacts", "win-desktop", "Protocol-Bunker", "app", "portable.env");
        }
    }

    private static string ResolveWriteTargetPath(string appBaseDir, string? repoRoot)
    {
        var localPath = Path.Combine(appBaseDir, "launcher.settings.json");
        var parentDir = Directory.GetParent(appBaseDir);
        if (parentDir is not null && string.Equals(parentDir.Name, "ProtocolBunker.Desktop.App", StringComparison.OrdinalIgnoreCase))
        {
            if (repoRoot is not null)
            {
                return Path.Combine(repoRoot, ".cache", "desktop", "launcher.settings.json");
            }
        }

        return localPath;
    }

    private static async Task<DesktopSettingsModel?> TryLoadLauncherSettingsAsync(string path, CancellationToken cancellationToken)
    {
        if (!File.Exists(path))
        {
            return null;
        }

        try
        {
            await using var stream = File.OpenRead(path);
            var model = await JsonSerializer.DeserializeAsync<LauncherSettingsPayload>(stream, JsonOptions, cancellationToken);
            if (model is null)
            {
                return null;
            }

            return new DesktopSettingsModel(
                Language: NormalizeLanguage(model.Language),
                Mode: NormalizeMode(model.Mode),
                Port: NormalizePort(model.Port),
                PublicHost: model.PublicHost?.Trim() ?? string.Empty,
                Domain: model.Domain?.Trim() ?? string.Empty,
                DataFolder: string.IsNullOrWhiteSpace(model.DataFolder) ? "app/data" : model.DataFolder.Trim(),
                RoomCode: model.RoomCode?.Trim() ?? string.Empty,
                DeveloperMode: model.DevMode,
                HostToken: model.HostToken?.Trim() ?? string.Empty,
                ViewToken: model.ViewToken?.Trim() ?? string.Empty,
                EditToken: model.EditToken?.Trim() ?? string.Empty);
        }
        catch
        {
            return null;
        }
    }

    private static async Task<DesktopSettingsModel?> TryLoadPortableEnvAsync(string path, CancellationToken cancellationToken)
    {
        if (!File.Exists(path))
        {
            return null;
        }

        try
        {
            var lines = await File.ReadAllLinesAsync(path, cancellationToken);
            var data = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var raw in lines)
            {
                var line = raw.Trim();
                if (line.Length == 0 || line.StartsWith("#") || line.StartsWith(";"))
                {
                    continue;
                }

                var separator = line.IndexOf('=');
                if (separator <= 0)
                {
                    continue;
                }

                var key = line[..separator].Trim();
                var value = line[(separator + 1)..].Trim();
                data[key] = value;
            }

            return new DesktopSettingsModel(
                Language: NormalizeLanguage(data.GetValueOrDefault("LANGUAGE")),
                Mode: NormalizeMode(data.GetValueOrDefault("MODE")),
                Port: NormalizePort(data.GetValueOrDefault("PORT")),
                PublicHost: (data.GetValueOrDefault("PUBLIC_HOST") ?? string.Empty).Trim(),
                Domain: (data.GetValueOrDefault("DOMAIN") ?? string.Empty).Trim(),
                DataFolder: string.IsNullOrWhiteSpace(data.GetValueOrDefault("DATA_DIR")) ? "app/data" : data["DATA_DIR"].Trim(),
                RoomCode: (data.GetValueOrDefault("ROOM_CODE") ?? string.Empty).Trim(),
                DeveloperMode: ToBool(data.GetValueOrDefault("DEV_MODE")),
                HostToken: (data.GetValueOrDefault("HOST_TOKEN") ?? string.Empty).Trim(),
                ViewToken: (data.GetValueOrDefault("VIEW_TOKEN") ?? string.Empty).Trim(),
                EditToken: (data.GetValueOrDefault("EDIT_TOKEN") ?? string.Empty).Trim());
        }
        catch
        {
            return null;
        }
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

    private static string NormalizeMode(string? mode)
    {
        var normalized = (mode ?? string.Empty).Trim().ToLowerInvariant();
        return normalized switch
        {
            "domain" => "domain",
            _ => "local",
        };
    }

    private static string NormalizeLanguage(string? language)
    {
        var normalized = (language ?? string.Empty).Trim().ToLowerInvariant();
        return normalized switch
        {
            "ru" => "ru",
            "en" => "en",
            _ => "auto",
        };
    }

    private static int NormalizePort(int? port)
    {
        if (port is > 0 and <= 65535)
        {
            return port.Value;
        }

        return DefaultPort;
    }

    private static int NormalizePort(string? raw)
    {
        return int.TryParse(raw, out var port) ? NormalizePort(port) : DefaultPort;
    }

    private static bool ToBool(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return false;
        }

        return raw.Trim() switch
        {
            "1" => true,
            "true" => true,
            "True" => true,
            "yes" => true,
            "on" => true,
            _ => false,
        };
    }

    private sealed class LauncherSettingsPayload
    {
        public string? Language { get; set; }

        public string? Mode { get; set; }

        public int? Port { get; set; }

        public string? PublicHost { get; set; }

        public string? Domain { get; set; }

        public string? DataFolder { get; set; }

        public string? RoomCode { get; set; }

        public bool DevMode { get; set; }

        public string? HostToken { get; set; }

        public string? ViewToken { get; set; }

        public string? EditToken { get; set; }
    }
}
