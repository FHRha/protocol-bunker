using ProtocolBunker.Desktop.Contracts.Models;

namespace ProtocolBunker.Desktop.Contracts.Services;

public interface IDesktopSettingsService
{
    Task<DesktopSettingsModel> LoadAsync(CancellationToken cancellationToken = default);

    Task SaveAsync(DesktopSettingsModel settings, CancellationToken cancellationToken = default);
}
