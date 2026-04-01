using ProtocolBunker.Desktop.Contracts.Models;

namespace ProtocolBunker.Desktop.Contracts.Services;

public interface IRoomLinkService
{
    Task<RoomLinksSnapshot> BuildAsync(DesktopSettingsModel? settingsOverride = null, CancellationToken cancellationToken = default);

    Task<ControlInviteResult> CreateControlInviteAsync(DesktopSettingsModel? settingsOverride = null, CancellationToken cancellationToken = default);
}
