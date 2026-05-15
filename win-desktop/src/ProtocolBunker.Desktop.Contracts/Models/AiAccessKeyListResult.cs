namespace ProtocolBunker.Desktop.Contracts.Models;

public sealed record AiAccessKeyListResult(
    bool Success,
    string Message,
    string FilePath,
    IReadOnlyList<AiAccessKeyRecordModel> Keys);
