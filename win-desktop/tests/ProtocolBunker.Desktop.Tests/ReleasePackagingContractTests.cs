using Xunit;

namespace ProtocolBunker.Desktop.Tests;

public sealed class ReleasePackagingContractTests
{
    private readonly string _repoRoot = ResolveRepoRoot();

    [Fact]
    public void PackRelease_UsesNewWinDesktopProjects()
    {
        var scriptPath = Path.Combine(_repoRoot, "win-desktop", "build", "pack-release.ps1");
        var script = File.ReadAllText(scriptPath);

        Assert.Contains(@"win-desktop\src\ProtocolBunker.Desktop.App\ProtocolBunker.Desktop.App.csproj", script);
        Assert.Contains(@"win-desktop\src\ProtocolBunker.Desktop.Setup\ProtocolBunker.Desktop.Setup.csproj", script);
        Assert.Contains(@"win-desktop\src\ProtocolBunker.Desktop.UpdateHelper\ProtocolBunker.Desktop.UpdateHelper.csproj", script);
    }

    [Fact]
    public void PackRelease_CopiesLauncherSupportDirectoriesIntoPayload()
    {
        var scriptPath = Path.Combine(_repoRoot, "win-desktop", "build", "pack-release.ps1");
        var script = File.ReadAllText(scriptPath);

        Assert.Contains(@"Join-Path $launcherPublish 'Localization'", script);
        Assert.Contains(@"Join-Path $PayloadRoot 'Localization'", script);
        Assert.Contains(@"Join-Path $launcherPublish 'AsciiAnimations'", script);
        Assert.Contains(@"Join-Path $PayloadRoot 'AsciiAnimations'", script);
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
