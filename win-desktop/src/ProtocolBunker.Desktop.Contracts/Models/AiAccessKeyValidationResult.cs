namespace ProtocolBunker.Desktop.Contracts.Models;

public sealed record AiAccessKeyValidationResult(
    bool Success,
    string Message,
    string FilePath,
    bool IsValid,
    AiAccessKeyRecordModel? Record);
