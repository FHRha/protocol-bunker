using System.Text.Json;
using Xunit;

namespace ProtocolBunker.Desktop.Tests;

public sealed class ArtifactSmokeTests
{
    private readonly string _repoRoot = ResolveRepoRoot();

    [Fact]
    public void WindowsPayload_ContainsRequiredDesktopFiles_WhenArtifactsArePresent()
    {
        var payloadRoot = Path.Combine(_repoRoot, @"artifacts\win-desktop\Protocol-Bunker");
        if (!Directory.Exists(payloadRoot))
        {
            return;
        }

        Assert.True(File.Exists(Path.Combine(payloadRoot, "ProtocolBunker.exe")));
        Assert.True(File.Exists(Path.Combine(payloadRoot, "UpdaterHelper.exe")));
        Assert.True(Directory.Exists(Path.Combine(payloadRoot, "Localization")));
        Assert.True(Directory.Exists(Path.Combine(payloadRoot, "AsciiAnimations")));
        Assert.True(File.Exists(Path.Combine(payloadRoot, @"app\VERSION")));
        Assert.True(File.Exists(Path.Combine(payloadRoot, @"app\portable.env")));
    }

    [Fact]
    public void WindowsPayload_ContainsLocalizedAndAsciiAssets_WhenArtifactsArePresent()
    {
        var payloadRoot = Path.Combine(_repoRoot, @"artifacts\win-desktop\Protocol-Bunker");
        if (!Directory.Exists(payloadRoot))
        {
            return;
        }

        Assert.True(File.Exists(Path.Combine(payloadRoot, @"Localization\desktop.ru.json")));
        Assert.True(File.Exists(Path.Combine(payloadRoot, @"Localization\desktop.en.json")));

        var asciiDir = Path.Combine(payloadRoot, "AsciiAnimations");
        var asciiFiles = Directory.GetFiles(asciiDir, "*.json", SearchOption.TopDirectoryOnly);
        Assert.NotEmpty(asciiFiles);
    }

    [Fact]
    public void WindowsSetupInstaller_ExistsAndIsNonEmpty_WhenArtifactsArePresent()
    {
        var version = ReadVersion();
        var installerPath = Path.Combine(_repoRoot, $@"artifacts\win-desktop\protocol-bunker-win-x64-desktop-setup-v{version}.exe");
        if (!File.Exists(installerPath))
        {
            return;
        }

        var fileInfo = new FileInfo(installerPath);
        Assert.True(fileInfo.Length > 0);
    }

    private string ReadVersion()
    {
        var packageJsonPath = Path.Combine(_repoRoot, "package.json");
        using var stream = File.OpenRead(packageJsonPath);
        using var document = JsonDocument.Parse(stream);
        return document.RootElement.GetProperty("version").GetString() ?? throw new InvalidOperationException("Missing version.");
    }

    private static string ResolveRepoRoot()
    {
        var current = new DirectoryInfo(AppContext.BaseDirectory);
        while (current is not null)
        {
            var solutionPath = Path.Combine(current.FullName, "Protocol_Bunker.sln");
            if (File.Exists(solutionPath))
            {
                return current.FullName;
            }

            current = current.Parent;
        }

        throw new InvalidOperationException("Repository root was not found.");
    }
}
