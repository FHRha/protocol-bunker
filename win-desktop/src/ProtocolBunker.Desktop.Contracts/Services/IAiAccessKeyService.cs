using ProtocolBunker.Desktop.Contracts.Models;

namespace ProtocolBunker.Desktop.Contracts.Services;

public interface IAiAccessKeyService
{
    Task<AiAccessKeyListResult> ListAsync(DesktopSettingsModel settings, CancellationToken cancellationToken = default);

    Task<AiAccessKeyCreateResult> CreateAsync(DesktopSettingsModel settings, string label, CancellationToken cancellationToken = default);

    Task<AiAccessKeyActionResult> UpdateLabelAsync(DesktopSettingsModel settings, string id, string label, CancellationToken cancellationToken = default);

    Task<AiAccessKeyActionResult> RevokeAsync(DesktopSettingsModel settings, string id, CancellationToken cancellationToken = default);

    Task<AiAccessKeyActionResult> DeleteAsync(DesktopSettingsModel settings, string id, CancellationToken cancellationToken = default);

    Task<AiAccessKeyValidationResult> ValidateAsync(DesktopSettingsModel settings, string key, CancellationToken cancellationToken = default);
}
