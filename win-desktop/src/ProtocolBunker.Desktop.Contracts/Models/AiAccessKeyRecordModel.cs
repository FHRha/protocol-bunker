namespace ProtocolBunker.Desktop.Contracts.Models;

public sealed record AiAccessKeyRecordModel(
    string Id,
    string Label,
    string Scopes,
    string CreatedAt,
    string LastUsedAt,
    string RevokedAt,
    bool IsRevoked);
