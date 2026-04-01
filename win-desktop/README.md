# ProtocolBunker Desktop

New Avalonia-based desktop application stack for Protocol: Bunker.

Current goal:
- build a new desktop product from scratch;
- use `win-desktop/` as the canonical Windows desktop path;
- use the old WPF launcher only as a historical behavior reference.

Project layout:
- `src/ProtocolBunker.Desktop.App` - Avalonia shell and views
- `src/ProtocolBunker.Desktop.Application` - view models and app-layer logic
- `src/ProtocolBunker.Desktop.Contracts` - DTOs and service contracts
- `src/ProtocolBunker.Desktop.Infrastructure` - temporary infrastructure/service implementations
