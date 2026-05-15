using System.Diagnostics;
using Avalonia.Controls;
using ProtocolBunker.Desktop.Contracts.Services;

namespace ProtocolBunker.Desktop.App.Services;

public sealed class AvaloniaPlatformShellService : IPlatformShellService
{
    private readonly Func<Window?> _windowAccessor;

    public AvaloniaPlatformShellService(Func<Window?> windowAccessor)
    {
        _windowAccessor = windowAccessor;
    }

    public async Task CopyTextAsync(string text, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return;
        }

        var clipboard = TopLevel.GetTopLevel(_windowAccessor())?.Clipboard;
        if (clipboard is null)
        {
            throw new InvalidOperationException("Clipboard is not available.");
        }

        await clipboard.SetTextAsync(text);
    }

    public Task OpenUrlAsync(string url, CancellationToken cancellationToken = default)
    {
        if (!string.IsNullOrWhiteSpace(url))
        {
            Process.Start(new ProcessStartInfo { FileName = url, UseShellExecute = true });
        }

        return Task.CompletedTask;
    }

    public Task OpenFolderAsync(string path, CancellationToken cancellationToken = default)
    {
        if (!string.IsNullOrWhiteSpace(path))
        {
            Process.Start(new ProcessStartInfo { FileName = path, UseShellExecute = true });
        }

        return Task.CompletedTask;
    }
}
