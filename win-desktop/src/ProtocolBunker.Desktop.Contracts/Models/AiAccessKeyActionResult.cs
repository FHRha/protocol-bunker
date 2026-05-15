namespace ProtocolBunker.Desktop.Contracts.Models;

public sealed record AiAccessKeyActionResult(
    bool Success,
    string Message,
    string FilePath,
    AiAccessKeyRecordModel? Record);
