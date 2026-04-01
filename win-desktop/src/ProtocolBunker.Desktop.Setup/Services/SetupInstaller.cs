using System.IO.Compression;
using System.Reflection;
using System.Text.Json;

namespace ProtocolBunker.Desktop.Setup.Services;

internal readonly record struct SetupProgressUpdate(string StatusKey, string DetailsKey, int Progress, bool CanCancel);

internal sealed class SetupInstaller
{
    internal static bool TryScheduleSelfDelete(string setupExePath)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(setupExePath) || !File.Exists(setupExePath))
            {
                return false;
            }

            var escapedPath = setupExePath.Replace("\"", "\"\"");
            var command = $"/c for /L %i in (1,1,30) do (del /f /q \"{escapedPath}\" >nul 2>nul && exit /b 0 || ping 127.0.0.1 -n 2 >nul)";

            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = command,
                CreateNoWindow = true,
                UseShellExecute = false,
                WindowStyle = System.Diagnostics.ProcessWindowStyle.Hidden,
            });

            return true;
        }
        catch
        {
            return false;
        }
    }

    public async Task RunAsync(Action<SetupProgressUpdate> onProgress, CancellationToken token)
    {
        var setupExePath = Environment.ProcessPath ?? throw new InvalidOperationException("Process path is unavailable.");
        var setupDir = Path.GetDirectoryName(setupExePath) ?? AppContext.BaseDirectory;
        var installDir = Path.Combine(setupDir, "Protocol-Bunker");
        var tempRoot = Path.Combine(Path.GetTempPath(), "ProtocolBunkerSetup", Guid.NewGuid().ToString("N"));
        var zipPath = Path.Combine(tempRoot, "payload.zip");
        var extractRoot = Path.Combine(tempRoot, "extracted");

        Directory.CreateDirectory(tempRoot);

        try
        {
            onProgress(new SetupProgressUpdate("install.prepare", "details.prepare", 8, true));
            await ExtractEmbeddedPayloadAsync(zipPath, token);

            onProgress(new SetupProgressUpdate("install.unpack", "details.unpack", 30, true));
            Directory.CreateDirectory(extractRoot);
            ZipFile.ExtractToDirectory(zipPath, extractRoot, overwriteFiles: true);
            token.ThrowIfCancellationRequested();

            onProgress(new SetupProgressUpdate("install.copy", "details.copy", 68, false));
            var payloadRoot = FindPayloadRoot(extractRoot);
            CopyDirectory(payloadRoot, installDir, overwrite: true);

            onProgress(new SetupProgressUpdate("install.finalize", "details.finalize", 90, false));
            await Task.Delay(150, token);

            onProgress(new SetupProgressUpdate("install.launch", "details.launch", 100, false));
            TryLaunchInstalledApp(installDir);
            TryScheduleSelfDelete(setupExePath);
            await Task.Delay(250, token);
        }
        finally
        {
            TryDeleteDirectory(tempRoot);
        }
    }

    private static async Task ExtractEmbeddedPayloadAsync(string destinationZipPath, CancellationToken token)
    {
        var assembly = Assembly.GetExecutingAssembly();
        var resourceName = assembly.GetManifestResourceNames().FirstOrDefault(n => n.EndsWith("Embedded.payload.zip", StringComparison.OrdinalIgnoreCase));
        if (resourceName is null)
        {
            throw new InvalidOperationException("Embedded payload.zip was not found in setup resources.");
        }

        await using var resource = assembly.GetManifestResourceStream(resourceName) ?? throw new InvalidOperationException("Failed to open embedded payload.zip stream.");
        await using var output = File.Create(destinationZipPath);
        await resource.CopyToAsync(output, token);
    }

    private static string FindPayloadRoot(string extractRoot)
    {
        var direct = Path.Combine(extractRoot, "Protocol-Bunker");
        if (Directory.Exists(direct)) return direct;
        var nested = Directory.GetDirectories(extractRoot, "Protocol-Bunker", SearchOption.AllDirectories).FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(nested)) return nested;
        throw new InvalidOperationException("Protocol-Bunker payload root was not found after extraction.");
    }

    private static void CopyDirectory(string sourceDir, string destinationDir, bool overwrite)
    {
        Directory.CreateDirectory(destinationDir);
        foreach (var dir in Directory.GetDirectories(sourceDir, "*", SearchOption.AllDirectories))
        {
            Directory.CreateDirectory(Path.Combine(destinationDir, Path.GetRelativePath(sourceDir, dir)));
        }
        foreach (var file in Directory.GetFiles(sourceDir, "*", SearchOption.AllDirectories))
        {
            var dest = Path.Combine(destinationDir, Path.GetRelativePath(sourceDir, file));
            Directory.CreateDirectory(Path.GetDirectoryName(dest)!);
            File.Copy(file, dest, overwrite);
        }
    }

    private static void TryLaunchInstalledApp(string installDir)
    {
        try
        {
            var launcherPath = Path.Combine(installDir, "ProtocolBunker.exe");
            if (!File.Exists(launcherPath)) return;
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
            {
                FileName = launcherPath,
                WorkingDirectory = Path.GetDirectoryName(launcherPath)!,
                UseShellExecute = true,
            });
        }
        catch
        {
        }
    }

    private static void TryDeleteDirectory(string path)
    {
        try
        {
            if (Directory.Exists(path)) Directory.Delete(path, true);
        }
        catch
        {
        }
    }
}

internal static class SetupAsciiLoader
{
    public static IReadOnlyList<string> LoadPlanetFrames()
    {
        using var stream = OpenPlanetFramesStream();
        if (stream is null)
        {
            return Array.Empty<string>();
        }

        using var reader = new StreamReader(stream);
        using var doc = JsonDocument.Parse(reader.ReadToEnd());
        var frames = new List<string>();
        foreach (var frameNode in doc.RootElement.EnumerateArray())
        {
            var lines = frameNode.EnumerateArray().Select(x => x.GetString() ?? string.Empty).ToList();
            var width = lines.Count == 0 ? 0 : lines.Max(x => x.Length);
            frames.Add(string.Join(Environment.NewLine, lines.Select(x => x.PadRight(width))));
        }
        return frames;
    }

    private static Stream? OpenPlanetFramesStream()
    {
        var assembly = Assembly.GetExecutingAssembly();
        var resourceName = assembly
            .GetManifestResourceNames()
            .FirstOrDefault(n => n.EndsWith("AsciiAnimations.animation-05.json", StringComparison.OrdinalIgnoreCase));

        if (resourceName is not null)
        {
            return assembly.GetManifestResourceStream(resourceName);
        }

        var filePath = Path.Combine(AppContext.BaseDirectory, "AsciiAnimations", "animation-05.json");
        return File.Exists(filePath) ? File.OpenRead(filePath) : null;
    }
}


