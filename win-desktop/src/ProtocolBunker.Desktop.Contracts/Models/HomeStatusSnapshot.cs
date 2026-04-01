namespace ProtocolBunker.Desktop.Contracts.Models;

public sealed record HomeStatusSnapshot(
    string Version,
    RuntimeState RuntimeState,
    string ActiveMode,
    int Port,
    string RoomCode,
    string ReachabilitySummary,
    string RuntimeSource,
    string InstallRoot,
    string AppRoot,
    string DataRoot,
    int? ProcessId,
    string StatusDetail);
