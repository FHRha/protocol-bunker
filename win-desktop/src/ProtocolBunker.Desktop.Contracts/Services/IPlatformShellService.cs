namespace ProtocolBunker.Desktop.Contracts.Services;

public interface IPlatformShellService
{
    Task CopyTextAsync(string text, CancellationToken cancellationToken = default);

    Task OpenUrlAsync(string url, CancellationToken cancellationToken = default);

    Task OpenFolderAsync(string path, CancellationToken cancellationToken = default);
}
