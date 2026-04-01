using System.Diagnostics;
using System.IO.Compression;
using System.Reflection;
using System.Text.Json;

namespace ProtocolBunker.Desktop.UpdateHelper.Services;

internal readonly record struct UpdateProgressUpdate(string StatusKey, string DetailsKey, int Progress, bool CanCancel);

internal readonly record struct UpdateArgs(int Pid, string InstallDir, string ZipPath, string LauncherName, bool PreviewUi);

internal sealed class UpdateInstaller
{
    private const int WaitForLauncherMs = 30000;

    public async Task RunAsync(UpdateArgs args, Action<UpdateProgressUpdate> onProgress, CancellationToken token)
    {
        if (args.PreviewUi)
        {
            onProgress(new UpdateProgressUpdate("preview.step", "preview.details", 18, false));
            return;
        }

        var installDir = Path.GetFullPath(args.InstallDir);
        var zipPath = Path.GetFullPath(args.ZipPath);
        var launcherName = string.IsNullOrWhiteSpace(args.LauncherName) ? "ProtocolBunker.exe" : args.LauncherName;
        var tempRoot = Path.Combine(Path.GetTempPath(), "ProtocolBunkerUpdate", Guid.NewGuid().ToString("N"));
        var extractDir = Path.Combine(tempRoot, "extract");

        Directory.CreateDirectory(tempRoot);

        try
        {
            onProgress(new UpdateProgressUpdate("update.wait", "details.wait", 12, true));
            await WaitForProcessExitAsync(args.Pid, token);

            if (!File.Exists(zipPath))
            {
                throw new FileNotFoundException("Update zip not found.", zipPath);
            }

            onProgress(new UpdateProgressUpdate("update.unpack", "details.unpack", 38, true));
            Directory.CreateDirectory(extractDir);
            await Task.Run(() => ZipFile.ExtractToDirectory(zipPath, extractDir, overwriteFiles: true), token);
            token.ThrowIfCancellationRequested();

            onProgress(new UpdateProgressUpdate("update.copy", "details.copy", 78, false));
            var payloadRoot = ResolvePayloadRoot(extractDir, launcherName);
            await Task.Run(() => CopyPayload(payloadRoot, installDir), token);

            onProgress(new UpdateProgressUpdate("update.launch", "details.launch", 96, false));
            TryLaunchInstalledApp(installDir, launcherName);

            onProgress(new UpdateProgressUpdate("update.done", "details.done", 100, false));
            await Task.Delay(180, token);
        }
        finally
        {
            TryDelete(zipPath);
            TryDeleteDirectory(tempRoot);
        }
    }

    public static UpdateArgs ParseArgs(string[] args)
    {
        var parsed = ParseArgsCore(args);
        if (args.Any(a => string.Equals(a, "--preview-ui", StringComparison.OrdinalIgnoreCase)))
        {
            return new UpdateArgs(0, AppContext.BaseDirectory, string.Empty, "ProtocolBunker.exe", true);
        }

        return new UpdateArgs(
            int.Parse(GetRequired(parsed, "pid")),
            GetRequired(parsed, "install-dir"),
            GetRequired(parsed, "zip"),
            parsed.GetValueOrDefault("launcher", "ProtocolBunker.exe"),
            false);
    }

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

    private static async Task WaitForProcessExitAsync(int pid, CancellationToken token)
    {
        if (pid <= 0)
        {
            return;
        }

        try
        {
            using var process = Process.GetProcessById(pid);
            if (process.HasExited)
            {
                return;
            }

            var completed = await Task.Run(() => process.WaitForExit(WaitForLauncherMs), token);
            if (!completed)
            {
                try
                {
                    process.Kill(entireProcessTree: true);
                    await Task.Run(() => process.WaitForExit(5000), token);
                }
                catch
                {
                }
            }
        }
        catch
        {
        }
    }

    private static Dictionary<string, string> ParseArgsCore(string[] args)
    {
        var dict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        for (var i = 0; i < args.Length; i++)
        {
            var token = args[i];
            if (!token.StartsWith("--", StringComparison.Ordinal))
            {
                continue;
            }

            var key = token[2..];
            if (i + 1 >= args.Length)
            {
                dict[key] = string.Empty;
                continue;
            }

            var value = args[i + 1];
            if (value.StartsWith("--", StringComparison.Ordinal))
            {
                dict[key] = string.Empty;
                continue;
            }

            dict[key] = value;
            i++;
        }

        return dict;
    }

    private static string GetRequired(IReadOnlyDictionary<string, string> parsed, string key)
    {
        if (!parsed.TryGetValue(key, out var value) || string.IsNullOrWhiteSpace(value))
        {
            throw new ArgumentException($"Missing argument --{key}");
        }

        return value;
    }

    private static string ResolvePayloadRoot(string extractedRoot, string launcherName)
    {
        var directLauncher = Path.Combine(extractedRoot, launcherName);
        if (File.Exists(directLauncher))
        {
            return extractedRoot;
        }

        var nested = Directory
            .EnumerateDirectories(extractedRoot)
            .FirstOrDefault(dir => File.Exists(Path.Combine(dir, launcherName)));

        if (nested is null)
        {
            throw new InvalidOperationException("Invalid update archive structure.");
        }

        return nested;
    }

    private static void CopyPayload(string sourceRoot, string installDir)
    {
        Directory.CreateDirectory(installDir);

        foreach (var directory in Directory.EnumerateDirectories(sourceRoot, "*", SearchOption.AllDirectories))
        {
            var relative = Path.GetRelativePath(sourceRoot, directory);
            if (ShouldSkip(relative))
            {
                continue;
            }

            Directory.CreateDirectory(Path.Combine(installDir, relative));
        }

        foreach (var sourceFile in Directory.EnumerateFiles(sourceRoot, "*", SearchOption.AllDirectories))
        {
            var relative = Path.GetRelativePath(sourceRoot, sourceFile);
            if (ShouldSkip(relative))
            {
                continue;
            }

            var destinationFile = Path.Combine(installDir, relative);
            var destinationDir = Path.GetDirectoryName(destinationFile);
            if (!string.IsNullOrWhiteSpace(destinationDir))
            {
                Directory.CreateDirectory(destinationDir);
            }

            CopyFileWithRetry(sourceFile, destinationFile, retries: 12, delayMs: 250);
        }
    }

    private static bool ShouldSkip(string relativePath)
    {
        var normalized = relativePath.Replace('\\', '/').TrimStart('/').ToLowerInvariant();
        return normalized == "app/portable.env"
               || normalized.StartsWith("app/data/")
               || normalized.StartsWith("app/logs/");
    }

    private static void CopyFileWithRetry(string sourceFile, string destinationFile, int retries, int delayMs)
    {
        for (var attempt = 0; attempt <= retries; attempt++)
        {
            try
            {
                if (File.Exists(destinationFile))
                {
                    var attrs = File.GetAttributes(destinationFile);
                    if ((attrs & FileAttributes.ReadOnly) != 0)
                    {
                        File.SetAttributes(destinationFile, attrs & ~FileAttributes.ReadOnly);
                    }
                }

                File.Copy(sourceFile, destinationFile, overwrite: true);
                return;
            }
            catch when (attempt < retries)
            {
                Thread.Sleep(delayMs);
            }
        }

        throw new IOException($"Failed to copy file: {sourceFile}");
    }

    private static void TryLaunchInstalledApp(string installDir, string launcherName)
    {
        try
        {
            var launcherPath = Path.Combine(installDir, launcherName);
            if (!File.Exists(launcherPath))
            {
                return;
            }

            Process.Start(new ProcessStartInfo
            {
                FileName = launcherPath,
                WorkingDirectory = installDir,
                UseShellExecute = true,
            });
        }
        catch
        {
        }
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

    private static void TryDelete(string filePath)
    {
        try
        {
            if (File.Exists(filePath))
            {
                File.Delete(filePath);
            }
        }
        catch
        {
        }
    }

    private static void TryDeleteDirectory(string path)
    {
        try
        {
            if (Directory.Exists(path))
            {
                Directory.Delete(path, recursive: true);
            }
        }
        catch
        {
        }
    }
}
