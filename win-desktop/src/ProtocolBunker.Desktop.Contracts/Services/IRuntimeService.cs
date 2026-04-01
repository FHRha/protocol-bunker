using ProtocolBunker.Desktop.Contracts.Models;

namespace ProtocolBunker.Desktop.Contracts.Services;

public interface IRuntimeService
{
    event EventHandler<RuntimeOutputEventArgs>? OutputReceived;
    event EventHandler? StateChanged;

    Task<HomeStatusSnapshot> GetHomeStatusAsync(DesktopSettingsModel? settingsOverride = null, CancellationToken cancellationToken = default);

    Task<RuntimeActionResult> StartAsync(DesktopSettingsModel? settingsOverride = null, CancellationToken cancellationToken = default);

    Task<RuntimeActionResult> StopAsync(CancellationToken cancellationToken = default);
}
