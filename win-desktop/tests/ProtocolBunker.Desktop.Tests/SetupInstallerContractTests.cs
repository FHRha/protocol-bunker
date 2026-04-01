using Xunit;

namespace ProtocolBunker.Desktop.Tests;

public sealed class SetupInstallerContractTests
{
    private readonly string _repoRoot = ResolveRepoRoot();

    [Fact]
    public void SetupInstaller_RunAsync_UsesExpectedProgressStageSequence()
    {
        var source = ReadInstallerSource();

        var prepareIndex = source.IndexOf(@"""install.prepare""", StringComparison.Ordinal);
        var unpackIndex = source.IndexOf(@"""install.unpack""", StringComparison.Ordinal);
        var copyIndex = source.IndexOf(@"""install.copy""", StringComparison.Ordinal);
        var finalizeIndex = source.IndexOf(@"""install.finalize""", StringComparison.Ordinal);
        var launchIndex = source.IndexOf(@"""install.launch""", StringComparison.Ordinal);

        Assert.True(prepareIndex >= 0);
        Assert.True(unpackIndex > prepareIndex);
        Assert.True(copyIndex > unpackIndex);
        Assert.True(finalizeIndex > copyIndex);
        Assert.True(launchIndex > finalizeIndex);
    }

    [Fact]
    public void SetupInstaller_RunAsync_CleansTempRootInFinally()
    {
        var source = ReadInstallerSource();

        Assert.Contains("finally", source);
        Assert.Contains("TryDeleteDirectory(tempRoot);", source);
    }

    [Fact]
    public void SetupInstaller_SchedulesSelfDeleteAfterLauncherStart()
    {
        var source = ReadInstallerSource();

        var launchIndex = source.IndexOf("TryLaunchInstalledApp(installDir);", StringComparison.Ordinal);
        var deleteIndex = source.IndexOf("TryScheduleSelfDelete(setupExePath);", StringComparison.Ordinal);

        Assert.True(launchIndex >= 0);
        Assert.True(deleteIndex > launchIndex);
    }

    [Fact]
    public void SetupInstaller_TryScheduleSelfDelete_UsesCmdDeleteLoop()
    {
        var source = ReadInstallerSource();

        Assert.Contains(@"FileName = ""cmd.exe""", source);
        Assert.Contains(@"del /f /q", source);
        Assert.Contains(@"for /L %i in (1,1,30)", source);
    }

    [Fact]
    public void SetupInstaller_DisablesCancelAfterCopyStage()
    {
        var source = ReadInstallerSource();

        Assert.Contains(@"new SetupProgressUpdate(""install.prepare"", ""details.prepare"", 8, true)", source);
        Assert.Contains(@"new SetupProgressUpdate(""install.unpack"", ""details.unpack"", 30, true)", source);
        Assert.Contains(@"new SetupProgressUpdate(""install.copy"", ""details.copy"", 68, false)", source);
        Assert.Contains(@"new SetupProgressUpdate(""install.finalize"", ""details.finalize"", 90, false)", source);
        Assert.Contains(@"new SetupProgressUpdate(""install.launch"", ""details.launch"", 100, false)", source);
    }

    private string ReadInstallerSource()
    {
        var path = Path.Combine(_repoRoot, @"win-desktop\src\ProtocolBunker.Desktop.Setup\Services\SetupInstaller.cs");
        return File.ReadAllText(path);
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
