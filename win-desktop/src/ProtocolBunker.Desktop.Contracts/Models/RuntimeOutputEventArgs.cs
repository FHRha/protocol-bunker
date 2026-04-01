namespace ProtocolBunker.Desktop.Contracts.Models;

public sealed class RuntimeOutputEventArgs : EventArgs
{
    public RuntimeOutputEventArgs(RuntimeOutputEntry entry)
    {
        Entry = entry;
    }

    public RuntimeOutputEntry Entry { get; }
}
