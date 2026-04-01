namespace ProtocolBunker.Desktop.Contracts.Models;

public sealed record RoomLinksSnapshot(
    string? RoomCode,
    string InternalBaseUrl,
    string? ExternalBaseUrl,
    string? PlayerUrlInternal,
    string? PlayerUrlExternal,
    string? OverlayUrlInternal,
    string? OverlayUrlExternal,
    string? ControlInviteUrlInternal,
    string? ControlInviteUrlExternal,
    string StatusMessage);
