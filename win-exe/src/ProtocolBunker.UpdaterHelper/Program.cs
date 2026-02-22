using System.Diagnostics;
using System.IO.Compression;

namespace ProtocolBunker.UpdaterHelper;

internal static class Program
{
    private const int WaitForLauncherMs = 30000;

    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            var parsed = ParseArgs(args);
            var pid = int.Parse(GetRequired(parsed, "pid"));
            var installDir = Path.GetFullPath(GetRequired(parsed, "install-dir"));
            var zipPath = Path.GetFullPath(GetRequired(parsed, "zip"));
            var launcherName = parsed.GetValueOrDefault("launcher", "ProtocolBunker.exe");

            WaitForProcessExit(pid);

            if (!File.Exists(zipPath))
            {
                throw new FileNotFoundException("Update zip not found.", zipPath);
            }

            var tempRoot = Path.Combine(Path.GetTempPath(), "ProtocolBunkerUpdate", Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(tempRoot);

            try
            {
                var extractDir = Path.Combine(tempRoot, "extract");
                ZipFile.ExtractToDirectory(zipPath, extractDir, overwriteFiles: true);

                var sourceRoot = ResolvePayloadRoot(extractDir, launcherName);
                CopyPayload(sourceRoot, installDir);

                var launcherPath = Path.Combine(installDir, launcherName);
                if (File.Exists(launcherPath))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = launcherPath,
                        WorkingDirectory = installDir,
                        UseShellExecute = true,
                    });
                }
            }
            finally
            {
                TryDelete(zipPath);
                TryDeleteDirectory(tempRoot);
            }

            return 0;
        }
        catch
        {
            return 1;
        }
    }

    private static void WaitForProcessExit(int pid)
    {
        try
        {
            var process = Process.GetProcessById(pid);
            process.WaitForExit(WaitForLauncherMs);
        }
        catch
        {
            // process is already gone
        }
    }

    private static Dictionary<string, string> ParseArgs(string[] args)
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
                dict[key] = "";
                continue;
            }

            var value = args[i + 1];
            if (value.StartsWith("--", StringComparison.Ordinal))
            {
                dict[key] = "";
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
            // ignore
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
            // ignore
        }
    }
}
