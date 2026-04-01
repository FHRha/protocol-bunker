namespace ProtocolBunker.Desktop.Application.ViewModels;

public sealed class RuntimeLogItemViewModel
{
    public required string Timestamp { get; init; }

    public required string Text { get; init; }

    public required string Level { get; init; }
}
