using ProtocolBunker.Desktop.Contracts.Models;

namespace ProtocolBunker.Desktop.Contracts.Services;

public interface IUpdateService
{
    Task<UpdateStatusSnapshot> GetStatusAsync(CancellationToken cancellationToken = default);

    Task<UpdateStatusSnapshot> CheckForUpdatesAsync(CancellationToken cancellationToken = default);

    Task OpenReleasesPageAsync(CancellationToken cancellationToken = default);

    Task OpenSelectedAssetAsync(string assetUrl, CancellationToken cancellationToken = default);
}
