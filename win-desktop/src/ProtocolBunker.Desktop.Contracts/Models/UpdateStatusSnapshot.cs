namespace ProtocolBunker.Desktop.Contracts.Models;

public sealed record UpdateStatusSnapshot(
    string CurrentVersion,
    string LatestVersion,
    string SelectedAssetName,
    string SelectedAssetUrl,
    string ReleasesPageUrl,
    bool IsUpdateAvailable,
    string StatusMessage);
