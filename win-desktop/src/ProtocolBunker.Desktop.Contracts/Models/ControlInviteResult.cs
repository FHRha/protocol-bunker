namespace ProtocolBunker.Desktop.Contracts.Models;

public sealed record ControlInviteResult(
    bool Success,
    string Message,
    string? InviteUrlInternal,
    string? InviteUrlExternal);
