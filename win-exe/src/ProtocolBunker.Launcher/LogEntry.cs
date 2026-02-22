using System.Windows.Media;
using Brush = System.Windows.Media.Brush;

namespace ProtocolBunker.Launcher;

internal enum LogLevel
{
    Info,
    Warn,
    Error,
}

internal sealed class LogEntry
{
    public required DateTime Timestamp { get; init; }
    public required LogLevel Level { get; init; }
    public required string Message { get; init; }
}

internal sealed class LogEntryView
{
    public required string Text { get; init; }
    public required Brush Foreground { get; init; }
}
