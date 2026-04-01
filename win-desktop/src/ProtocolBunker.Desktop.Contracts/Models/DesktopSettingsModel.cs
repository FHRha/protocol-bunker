namespace ProtocolBunker.Desktop.Contracts.Models;

public sealed record DesktopSettingsModel(
    string Language,
    string Mode,
    int Port,
    string PublicHost,
    string Domain,
    string DataFolder,
    string RoomCode,
    bool DeveloperMode,
    string HostToken,
    string ViewToken,
    string EditToken);
