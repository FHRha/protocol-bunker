using System.Security.Cryptography;

namespace ProtocolBunker.Desktop.Infrastructure.Services;

public sealed class DesktopApiSessionService
{
    public const string HeaderName = "X-Bunker-Desktop-Secret";
    public const string EnvironmentVariableName = "BUNKER_DESKTOP_API_SECRET";

    public DesktopApiSessionService()
    {
        Secret = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
    }

    public string Secret { get; }
}
