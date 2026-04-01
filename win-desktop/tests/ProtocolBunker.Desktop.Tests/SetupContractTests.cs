using Xunit;

namespace ProtocolBunker.Desktop.Tests;

public sealed class SetupContractTests
{
    private readonly string _repoRoot = ResolveRepoRoot();

    [Fact]
    public void SetupProject_EmbedsPlanetAsciiAnimation()
    {
        var csprojPath = Path.Combine(_repoRoot, @"win-desktop\src\ProtocolBunker.Desktop.Setup\ProtocolBunker.Desktop.Setup.csproj");
        var csproj = File.ReadAllText(csprojPath);

        Assert.Contains(@"<EmbeddedResource Include=""AsciiAnimations\animation-05.json""", csproj);
    }

    [Fact]
    public void SetupProject_EmbedsPayloadZip_WhenAvailable()
    {
        var csprojPath = Path.Combine(_repoRoot, @"win-desktop\src\ProtocolBunker.Desktop.Setup\ProtocolBunker.Desktop.Setup.csproj");
        var csproj = File.ReadAllText(csprojPath);

        Assert.Contains(@"<EmbeddedResource Include=""Embedded\payload.zip""", csproj);
        Assert.Contains(@"Condition=""Exists('Embedded\payload.zip')""", csproj);
    }

    [Fact]
    public void SetupInstaller_LoadsPlanetFramesFromEmbeddedResourceFirst()
    {
        var sourcePath = Path.Combine(_repoRoot, @"win-desktop\src\ProtocolBunker.Desktop.Setup\Services\SetupInstaller.cs");
        var source = File.ReadAllText(sourcePath);

        Assert.Contains(@"EndsWith(""AsciiAnimations.animation-05.json""", source);
        Assert.Contains("GetManifestResourceStream", source);
        Assert.Contains(@"Path.Combine(AppContext.BaseDirectory, ""AsciiAnimations"", ""animation-05.json"")", source);
    }

    [Fact]
    public void SetupTexts_ContainRequiredRuAndEnKeys()
    {
        var sourcePath = Path.Combine(_repoRoot, @"win-desktop\src\ProtocolBunker.Desktop.Setup\Services\SetupShell.cs");
        var source = File.ReadAllText(sourcePath);

        foreach (var required in new[]
                 {
                     @"""en""",
                     @"""ru""",
                     @"""actions.start""",
                     @"""actions.stop""",
                     @"""actions.finish""",
                     @"""install.prepare""",
                     @"""install.copy""",
                     @"""install.launch""",
                 })
        {
            Assert.Contains(required, source);
        }
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
