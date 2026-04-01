using System.Diagnostics;
using ProtocolBunker.Desktop.Contracts.Services;

namespace ProtocolBunker.Desktop.Infrastructure.Services;

public sealed class DesktopPlatformShellService : IPlatformShellService
{
    public async Task CopyTextAsync(string text, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return;
        }

        var normalized = text.Replace("`", "``").Replace("\"", "`\"");
        var psi = new ProcessStartInfo
        {
            FileName = "powershell.exe",
            Arguments = $"-NoProfile -Command \"Set-Clipboard -Value \\\"{normalized}\\\"\"",
            UseShellExecute = false,
            CreateNoWindow = true,
        };

        using var process = Process.Start(psi);
        if (process is null)
        {
            throw new InvalidOperationException("Failed to launch clipboard helper.");
        }

        await process.WaitForExitAsync(cancellationToken);
        if (process.ExitCode != 0)
        {
            throw new InvalidOperationException("Clipboard helper exited with a non-zero code.");
        }
    }

    public Task OpenUrlAsync(string url, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            return Task.CompletedTask;
        }

        Process.Start(new ProcessStartInfo
        {
            FileName = url,
            UseShellExecute = true,
        });

        return Task.CompletedTask;
    }

    public Task OpenFolderAsync(string path, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return Task.CompletedTask;
        }

        Process.Start(new ProcessStartInfo
        {
            FileName = path,
            UseShellExecute = true,
        });

        return Task.CompletedTask;
    }
}
