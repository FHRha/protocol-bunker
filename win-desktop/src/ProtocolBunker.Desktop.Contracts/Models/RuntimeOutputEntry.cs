namespace ProtocolBunker.Desktop.Contracts.Models;

public sealed record RuntimeOutputEntry(
    DateTimeOffset Timestamp,
    string Text,
    bool IsError);
