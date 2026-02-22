using System.Text.Json;
using System.IO;

namespace ProtocolBunker.Launcher;

internal sealed class LauncherSettings
{
    public string Mode { get; set; } = "local";
    public int Port { get; set; } = 8080;
    public string PublicHost { get; set; } = string.Empty;
    public string Domain { get; set; } = string.Empty;
    public string DataFolder { get; set; } = @"app\data";
    public string RoomCode { get; set; } = string.Empty;
    public string HostToken { get; set; } = string.Empty;
    public string ViewToken { get; set; } = string.Empty;
    public string EditToken { get; set; } = string.Empty;
    public bool DevMode { get; set; }
    public string Theme { get; set; } = ThemeManager.SystemThemeName;
    public bool AutoScrollLogs { get; set; } = true;
    public string OpenTarget { get; set; } = "internal";
    public bool MinimizeToTray { get; set; } = true;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
    };

    public static LauncherSettings LoadOrDefault(string path)
    {
        try
        {
            if (!File.Exists(path))
            {
                return new LauncherSettings();
            }

            var json = File.ReadAllText(path);
            var parsed = JsonSerializer.Deserialize<LauncherSettings>(json, JsonOptions);
            return parsed ?? new LauncherSettings();
        }
        catch
        {
            return new LauncherSettings();
        }
    }

    public void Save(string path)
    {
        var directory = Path.GetDirectoryName(path);
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }

        var json = JsonSerializer.Serialize(this, JsonOptions);
        File.WriteAllText(path, json);
    }
}
