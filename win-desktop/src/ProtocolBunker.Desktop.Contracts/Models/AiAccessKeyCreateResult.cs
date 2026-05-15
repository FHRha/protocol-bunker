namespace ProtocolBunker.Desktop.Contracts.Models;

public sealed record AiAccessKeyCreateResult(
    bool Success,
    string Message,
    string FilePath,
    string CreatedKey,
    AiAccessKeyRecordModel? Record);
