using System.Text.Json;
using ProtocolBunker.Desktop.Contracts.Models;
using ProtocolBunker.Desktop.Infrastructure.Services;
using Xunit;

namespace ProtocolBunker.Desktop.Tests;

[Collection("DesktopSettingsFileTests")]
public sealed class FileDesktopSettingsServiceTests : IDisposable
{
    private readonly string _appBaseDir = AppContext.BaseDirectory;
    private readonly string _launcherSettingsPath;
    private readonly string _portableEnvPath;

    public FileDesktopSettingsServiceTests()
    {
        _launcherSettingsPath = Path.Combine(_appBaseDir, "launcher.settings.json");
        _portableEnvPath = Path.Combine(_appBaseDir, "app", "portable.env");
        Cleanup();
    }

    [Fact]
    public async Task SaveAsync_ThenLoadAsync_RoundTripsNormalizedLauncherSettings()
    {
        var service = new FileDesktopSettingsService();
        var model = new DesktopSettingsModel(
            Language: "EN",
            Mode: "DOMAIN",
            Port: 8080,
            PublicHost: " https://public.example:8080/path ",
            Domain: " https://bunker.example.com/path ",
            DataFolder: " app/data ",
            AiGatewayBaseUrl: " https://api.openai.com/v1 ",
            AiGatewayApiKey: " gateway-key ",
            AiGatewayModel: " gpt-4o-mini ",
            AiGatewayTimeoutMs: 45000,
            RoomCode: " abcd ",
            DeveloperMode: true,
            HostToken: " host ",
            ViewToken: " view ",
            EditToken: " edit ");

        await service.SaveAsync(model);
        var loaded = await service.LoadAsync();

        Assert.Equal("en", loaded.Language);
        Assert.Equal("domain", loaded.Mode);
        Assert.Equal(8080, loaded.Port);
        Assert.Equal("https://public.example:8080/path", loaded.PublicHost);
        Assert.Equal("https://bunker.example.com/path", loaded.Domain);
        Assert.Equal("app/data", loaded.DataFolder);
        Assert.Equal("https://api.openai.com/v1", loaded.AiGatewayBaseUrl);
        Assert.Equal("gateway-key", loaded.AiGatewayApiKey);
        Assert.Equal("gpt-4o-mini", loaded.AiGatewayModel);
        Assert.Equal(45000, loaded.AiGatewayTimeoutMs);
        Assert.Equal("abcd", loaded.RoomCode);
        Assert.True(loaded.DeveloperMode);
        Assert.Equal("host", loaded.HostToken);
        Assert.Equal("view", loaded.ViewToken);
        Assert.Equal("edit", loaded.EditToken);
    }

    [Fact]
    public async Task LoadAsync_ParsesPortableEnv_WhenLauncherSettingsAreMissing()
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_portableEnvPath)!);
        await File.WriteAllTextAsync(
            _portableEnvPath,
            """
            PORT=9090
            MODE=domain
            DOMAIN=bunker.example.com
            PUBLIC_HOST=public.example
            DATA_DIR=portable-data
            BUNKER_AI_GATEWAY_BASE_URL=https://api.openai.com/v1
            BUNKER_AI_GATEWAY_API_KEY=gateway-token
            BUNKER_AI_GATEWAY_MODEL=test-model
            BUNKER_AI_GATEWAY_TIMEOUT_MS=30000
            ROOM_CODE=QWER
            DEV_MODE=1
            HOST_TOKEN=host-token
            VIEW_TOKEN=view-token
            EDIT_TOKEN=edit-token
            LANGUAGE=ru
            """);

        var service = new FileDesktopSettingsService();
        var loaded = await service.LoadAsync();

        Assert.Equal("ru", loaded.Language);
        Assert.Equal("domain", loaded.Mode);
        Assert.Equal(9090, loaded.Port);
        Assert.Equal("public.example", loaded.PublicHost);
        Assert.Equal("bunker.example.com", loaded.Domain);
        Assert.Equal("portable-data", loaded.DataFolder);
        Assert.Equal("https://api.openai.com/v1", loaded.AiGatewayBaseUrl);
        Assert.Equal("gateway-token", loaded.AiGatewayApiKey);
        Assert.Equal("test-model", loaded.AiGatewayModel);
        Assert.Equal(30000, loaded.AiGatewayTimeoutMs);
        Assert.Equal("QWER", loaded.RoomCode);
        Assert.True(loaded.DeveloperMode);
        Assert.Equal("host-token", loaded.HostToken);
        Assert.Equal("view-token", loaded.ViewToken);
        Assert.Equal("edit-token", loaded.EditToken);
    }

    [Fact]
    public async Task LoadAsync_NormalizesInvalidLauncherSettingsValues()
    {
        var payload = new
        {
            Language = "zzz",
            Mode = "unexpected",
            Port = 99999,
            PublicHost = " public.example ",
            Domain = " bunker.example.com ",
            DataFolder = "",
            RoomCode = " room ",
            DevMode = false,
            HostToken = " host ",
            ViewToken = " view ",
            EditToken = " edit "
        };

        await File.WriteAllTextAsync(_launcherSettingsPath, JsonSerializer.Serialize(payload));

        var service = new FileDesktopSettingsService();
        var loaded = await service.LoadAsync();

        Assert.Equal("auto", loaded.Language);
        Assert.Equal("local", loaded.Mode);
        Assert.Equal(8080, loaded.Port);
        Assert.Equal("public.example", loaded.PublicHost);
        Assert.Equal("bunker.example.com", loaded.Domain);
        Assert.Equal("app/data", loaded.DataFolder);
        Assert.Equal("room", loaded.RoomCode);
    }

    public void Dispose()
    {
        Cleanup();
    }

    private void Cleanup()
    {
        TryDeleteFile(_launcherSettingsPath);
        TryDeleteFile(_portableEnvPath);

        var appDir = Path.Combine(_appBaseDir, "app");
        try
        {
            if (Directory.Exists(appDir) && !Directory.EnumerateFileSystemEntries(appDir).Any())
            {
                Directory.Delete(appDir, true);
            }
        }
        catch
        {
        }
    }

    private static void TryDeleteFile(string path)
    {
        try
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
        catch
        {
        }
    }
}
