using System.Net.Http.Json;
using System.Globalization;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text.RegularExpressions;
using ProtocolBunker.Desktop.Contracts.Models;
using ProtocolBunker.Desktop.Contracts.Services;

namespace ProtocolBunker.Desktop.Infrastructure.Services;

public sealed class DesktopRoomLinkService : IRoomLinkService
{
    private const string DesktopEndpointsPath = "/api/desktop/endpoints";
    private const string DesktopAccessPath = "/api/desktop/access";
    private const string DesktopControlInvitePath = "/api/desktop/control-invite";
    private static readonly string[] PublicIpProviders = ["https://api.ipify.org", "https://ifconfig.me/ip"];
    private static readonly string[] VpnAdapterNameTokens =
    [
        "nekobox", "vpn", "wintun", "wireguard", "tun", "tap", "openvpn", "clash", "warp",
        "vethernet", "hyper-v", "vmware", "virtual", "loopback", "docker", "podman", "wsl",
    ];
    private readonly IDesktopSettingsService _desktopSettingsService;
    private readonly IRuntimeService _runtimeService;
    private readonly ILocalizationService _localizationService;
    private readonly DesktopApiSessionService _desktopApiSessionService;
    private readonly HttpClient _httpClient = new() { Timeout = TimeSpan.FromSeconds(10) };
    private readonly SemaphoreSlim _publicIpLock = new(1, 1);
    private static string? s_cachedLanIp;
    private string? _resolvedPublicIp;

    public DesktopRoomLinkService(
        IDesktopSettingsService desktopSettingsService,
        IRuntimeService runtimeService,
        ILocalizationService localizationService,
        DesktopApiSessionService desktopApiSessionService)
    {
        _desktopSettingsService = desktopSettingsService;
        _runtimeService = runtimeService;
        _localizationService = localizationService;
        _desktopApiSessionService = desktopApiSessionService;
    }

    public async Task<RoomLinksSnapshot> BuildAsync(DesktopSettingsModel? settingsOverride = null, CancellationToken cancellationToken = default)
    {
        var settings = settingsOverride ?? await _desktopSettingsService.LoadAsync(cancellationToken);
        var runtime = await _runtimeService.GetHomeStatusAsync(settings, cancellationToken);
        var port = runtime.Port > 0 ? runtime.Port : settings.Port;
        var (internalBaseUrl, externalBaseUrl) = await ResolveBaseEndpointsAsync(
            port,
            settings,
            allowPublicIpFallback: runtime.RuntimeState == RuntimeState.Running,
            cancellationToken);

        if (runtime.RuntimeState != RuntimeState.Running)
        {
            return EmptySnapshot(null, internalBaseUrl, externalBaseUrl, _localizationService.Get("access.status.runtime_not_running"));
        }

        var room = (settings.RoomCode ?? string.Empty).Trim().ToUpperInvariant();
        if (room.Length == 0)
        {
            return new RoomLinksSnapshot(
                RoomCode: null,
                InternalBaseUrl: internalBaseUrl,
                ExternalBaseUrl: externalBaseUrl,
                PlayerUrlInternal: null,
                PlayerUrlExternal: null,
                OverlayUrlInternal: null,
                OverlayUrlExternal: null,
                ControlInviteUrlInternal: null,
                ControlInviteUrlExternal: null,
                StatusMessage: _localizationService.Get("access.status.room_empty"));
        }

        if (port <= 0)
        {
            return new RoomLinksSnapshot(
                RoomCode: null,
                InternalBaseUrl: internalBaseUrl,
                ExternalBaseUrl: externalBaseUrl,
                PlayerUrlInternal: null,
                PlayerUrlExternal: null,
                OverlayUrlInternal: null,
                OverlayUrlExternal: null,
                ControlInviteUrlInternal: null,
                ControlInviteUrlExternal: null,
                StatusMessage: _localizationService.Get("access.status.port_unresolved"));
        }

        var requestUrl = $"http://127.0.0.1:{port}{DesktopAccessPath}";
        try
        {
            using var request = CreateDesktopRequest(requestUrl, new { roomCode = room });
            using var response = await _httpClient.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                var error = await response.Content.ReadFromJsonAsync<DesktopErrorPayload>(cancellationToken: cancellationToken);
                return EmptySnapshot(room, internalBaseUrl, externalBaseUrl, error?.Message ?? BuildFailureMessage(response.StatusCode));
            }

            var payload = await response.Content.ReadFromJsonAsync<DesktopAccessPayload>(cancellationToken: cancellationToken);
            if (payload?.Ok != true || payload.Links is null)
            {
                return EmptySnapshot(room, internalBaseUrl, externalBaseUrl, _localizationService.Get("access.status.desktop_payload_invalid"));
            }

            return new RoomLinksSnapshot(
                RoomCode: payload.RoomCode ?? room,
                InternalBaseUrl: internalBaseUrl,
                ExternalBaseUrl: externalBaseUrl,
                PlayerUrlInternal: RebaseUrl(payload.Links.AppUrl?.Lan, internalBaseUrl),
                PlayerUrlExternal: RebaseUrl(payload.Links.AppUrl?.Public, externalBaseUrl),
                OverlayUrlInternal: RebaseUrl(payload.Links.OverlayViewUrl?.Lan, internalBaseUrl),
                OverlayUrlExternal: RebaseUrl(payload.Links.OverlayViewUrl?.Public, externalBaseUrl),
                ControlInviteUrlInternal: RebaseUrl(payload.Links.OverlayControlUrl?.Lan, internalBaseUrl),
                ControlInviteUrlExternal: RebaseUrl(payload.Links.OverlayControlUrl?.Public, externalBaseUrl),
                StatusMessage: BuildStatusMessage(payload.RoomCode ?? room, payload.Links.AppUrl?.Public));
        }
        catch (Exception ex)
        {
            _ = ex;
            return EmptySnapshot(room, internalBaseUrl, externalBaseUrl, _localizationService.Get("access.status.desktop_exception"));
        }
    }

    public async Task<ControlInviteResult> CreateControlInviteAsync(DesktopSettingsModel? settingsOverride = null, CancellationToken cancellationToken = default)
    {
        var settings = settingsOverride ?? await _desktopSettingsService.LoadAsync(cancellationToken);
        var runtime = await _runtimeService.GetHomeStatusAsync(settings, cancellationToken);
        if (runtime.RuntimeState != RuntimeState.Running)
        {
            return new ControlInviteResult(false, _localizationService.Get("access.status.runtime_not_running"), null, null);
        }

        var port = runtime.Port > 0 ? runtime.Port : settings.Port;
        if (port <= 0)
        {
            return new ControlInviteResult(false, _localizationService.Get("access.status.runtime_port_unresolved"), null, null);
        }

        var roomCode = (settings.RoomCode ?? string.Empty).Trim().ToUpperInvariant();
        if (roomCode.Length == 0)
        {
            return new ControlInviteResult(false, _localizationService.Get("access.status.room_required"), null, null);
        }

        var requestUrl = $"http://127.0.0.1:{port}{DesktopControlInvitePath}";

        try
        {
            using var request = CreateDesktopRequest(requestUrl, new { roomCode });
            using var response = await _httpClient.SendAsync(request, cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadFromJsonAsync<DesktopErrorPayload>(cancellationToken: cancellationToken);
                return new ControlInviteResult(
                    false,
                    body?.Message ?? BuildFailureMessage(response.StatusCode),
                    null,
                    null);
            }

            var payload = await response.Content.ReadFromJsonAsync<ControlInvitePayload>(cancellationToken: cancellationToken);
            if (payload is null || payload.Ok != true)
            {
                return new ControlInviteResult(false, _localizationService.Get("access.status.invite_payload_invalid"), null, null);
            }

            return new ControlInviteResult(
                true,
                _localizationService.Get("access.status.invite_created"),
                payload.InviteUrlLan,
                payload.InviteUrlExternal);
        }
        catch (Exception ex)
        {
            _ = ex;
            return new ControlInviteResult(
                false,
                _localizationService.Get("access.status.invite_exception"),
                null,
                null);
        }
    }

    private HttpRequestMessage CreateDesktopRequest<TPayload>(string requestUrl, TPayload payload)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, requestUrl)
        {
            Content = JsonContent.Create(payload),
        };
        request.Headers.TryAddWithoutValidation(DesktopApiSessionService.HeaderName, _desktopApiSessionService.Secret);
        return request;
    }

    private RoomLinksSnapshot EmptySnapshot(string? roomCode, string internalBaseUrl, string? externalBaseUrl, string message)
    {
        return new RoomLinksSnapshot(
            RoomCode: roomCode,
            InternalBaseUrl: internalBaseUrl,
            ExternalBaseUrl: externalBaseUrl,
            PlayerUrlInternal: null,
            PlayerUrlExternal: null,
            OverlayUrlInternal: null,
            OverlayUrlExternal: null,
            ControlInviteUrlInternal: null,
            ControlInviteUrlExternal: null,
            StatusMessage: message);
    }

    private async Task<(string InternalBaseUrl, string? ExternalBaseUrl)> ResolveBaseEndpointsAsync(
        int port,
        DesktopSettingsModel settings,
        bool allowPublicIpFallback,
        CancellationToken cancellationToken)
    {
        var fallbackInternal = BuildInternalBase(settings, port);
        var fallbackExternal = await BuildFallbackExternalBaseAsync(settings, port, allowPublicIpFallback, cancellationToken);
        if (port <= 0)
        {
            return (fallbackInternal, fallbackExternal);
        }

        var requestUrl = $"http://127.0.0.1:{port}{DesktopEndpointsPath}";
        try
        {
            using var request = CreateDesktopRequest(requestUrl, new { });
            using var response = await _httpClient.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return (fallbackInternal, fallbackExternal);
            }

            var payload = await response.Content.ReadFromJsonAsync<DesktopEndpointsPayload>(cancellationToken: cancellationToken);
            if (payload?.Ok != true || payload.Base is null)
            {
                return (fallbackInternal, fallbackExternal);
            }

            return (
                fallbackInternal,
                string.IsNullOrWhiteSpace(payload.Base.Public) ? fallbackExternal : payload.Base.Public);
        }
        catch
        {
            return (fallbackInternal, fallbackExternal);
        }
    }

    private async Task<string?> BuildFallbackExternalBaseAsync(
        DesktopSettingsModel settings,
        int port,
        bool allowPublicIpFallback,
        CancellationToken cancellationToken)
    {
        var configured = BuildConfiguredExternalBase(settings, port);
        if (!string.IsNullOrWhiteSpace(configured))
        {
            return configured;
        }

        if (!allowPublicIpFallback)
        {
            return null;
        }

        var publicIp = await TryResolvePublicIpAsync(cancellationToken);
        return string.IsNullOrWhiteSpace(publicIp) || port <= 0 ? null : $"http://{publicIp}:{port}";
    }

    private static string? BuildConfiguredExternalBase(DesktopSettingsModel settings, int port)
    {
        if (string.Equals(settings.Mode?.Trim(), "domain", StringComparison.OrdinalIgnoreCase) &&
            !string.IsNullOrWhiteSpace(settings.Domain))
        {
            var domain = NormalizeHost(settings.Domain);
            if (domain.Length == 0) return null;
            if (IsLocalHostValue(domain) && !settings.DeveloperMode) return null;
            return $"https://{domain}";
        }

        if (!string.IsNullOrWhiteSpace(settings.PublicHost) && port > 0)
        {
            var publicHost = NormalizeHost(settings.PublicHost);
            if (publicHost.Length == 0) return null;
            if (IsLocalHostValue(publicHost) && !settings.DeveloperMode) return null;
            return $"http://{publicHost}:{port}";
        }

        return null;
    }

    private static string BuildInternalBase(DesktopSettingsModel settings, int port)
    {
        if (port <= 0)
        {
            return string.Empty;
        }

        if (settings.DeveloperMode)
        {
            return $"http://localhost:{port}";
        }

        var lanIp = SelectLanIp();
        if (string.IsNullOrWhiteSpace(lanIp) || IsLocalHostValue(lanIp))
        {
            return $"http://127.0.0.1:{port}";
        }

        return $"http://{lanIp}:{port}";
    }

    private static string? RebaseUrl(string? rawUrl, string? targetBase)
    {
        if (string.IsNullOrWhiteSpace(rawUrl) || string.IsNullOrWhiteSpace(targetBase))
        {
            return null;
        }

        if (!Uri.TryCreate(rawUrl, UriKind.Absolute, out var sourceUri))
        {
            return null;
        }

        return $"{targetBase.TrimEnd('/')}{sourceUri.PathAndQuery}{sourceUri.Fragment}";
    }

    private static string NormalizeHost(string? value)
    {
        var raw = (value ?? string.Empty).Trim();
        if (raw.Length == 0) return string.Empty;

        if (Uri.TryCreate(raw, UriKind.Absolute, out var uri))
        {
            raw = uri.Host;
        }
        else
        {
            raw = raw.Replace("http://", string.Empty, StringComparison.OrdinalIgnoreCase)
                .Replace("https://", string.Empty, StringComparison.OrdinalIgnoreCase);

            var slashIndex = raw.IndexOf('/');
            if (slashIndex >= 0) raw = raw[..slashIndex];

            var colonIndex = raw.IndexOf(':');
            if (colonIndex >= 0) raw = raw[..colonIndex];
        }

        return raw.Trim();
    }

    private static bool IsLocalHostValue(string value)
    {
        var normalized = value.Trim().ToLowerInvariant();
        return normalized is "localhost" or "127.0.0.1" or "0.0.0.0" or "::1";
    }

    private static string SelectLanIp()
    {
        if (!string.IsNullOrWhiteSpace(s_cachedLanIp))
        {
            return s_cachedLanIp;
        }

        var bestIp = "127.0.0.1";
        var bestScore = -1;

        foreach (var adapter in NetworkInterface.GetAllNetworkInterfaces())
        {
            if (adapter.OperationalStatus != OperationalStatus.Up) continue;

            var adapterName = $"{adapter.Name} {adapter.Description}".ToLowerInvariant();
            var blocked = VpnAdapterNameTokens.Any(token => adapterName.Contains(token));
            var props = adapter.GetIPProperties();
            var hasGateway = props.GatewayAddresses.Any(g => g.Address.AddressFamily == AddressFamily.InterNetwork && !g.Address.Equals(System.Net.IPAddress.Any));

            foreach (var unicast in props.UnicastAddresses)
            {
                if (unicast.Address.AddressFamily != AddressFamily.InterNetwork) continue;

                var ip = unicast.Address.ToString();
                if (ip.StartsWith("127.", StringComparison.Ordinal) || ip.StartsWith("169.254.", StringComparison.Ordinal)) continue;

                var score = 0;
                if (ip.StartsWith("10.", StringComparison.Ordinal) ||
                    ip.StartsWith("192.168.", StringComparison.Ordinal) ||
                    Regex.IsMatch(ip, "^172\\.(1[6-9]|2[0-9]|3[0-1])\\."))
                {
                    score += 100;
                }

                if (hasGateway) score += 20;
                if (!blocked) score += 20;

                if (score > bestScore)
                {
                    bestScore = score;
                    bestIp = ip;
                }
            }
        }

        s_cachedLanIp = bestIp;
        return bestIp;
    }

    private async Task<string?> TryResolvePublicIpAsync(CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(_resolvedPublicIp))
        {
            return _resolvedPublicIp;
        }

        await _publicIpLock.WaitAsync(cancellationToken);
        try
        {
            if (!string.IsNullOrWhiteSpace(_resolvedPublicIp))
            {
                return _resolvedPublicIp;
            }

            foreach (var provider in PublicIpProviders)
            {
                try
                {
                    using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                    cts.CancelAfter(TimeSpan.FromSeconds(5));
                    var value = (await _httpClient.GetStringAsync(provider, cts.Token)).Trim();
                    if (System.Net.IPAddress.TryParse(value, out var address) &&
                        address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
                    {
                        _resolvedPublicIp = value;
                        return value;
                    }
                }
                catch
                {
                    // try next provider
                }
            }

            return null;
        }
        finally
        {
            _publicIpLock.Release();
        }
    }

    private string BuildFailureMessage(System.Net.HttpStatusCode statusCode)
    {
        return statusCode == System.Net.HttpStatusCode.NotFound
            ? _localizationService.Get("access.status.room_not_found")
            : string.Format(CultureInfo.CurrentUICulture, _localizationService.Get("access.status.desktop_request_failed"), (int)statusCode);
    }

    private string BuildStatusMessage(string roomCode, string? externalBase)
    {
        if (roomCode.Length == 0)
        {
            return _localizationService.Get("access.status.room_empty");
        }

        return string.IsNullOrWhiteSpace(externalBase)
            ? _localizationService.Get("access.status.internal_only")
            : _localizationService.Get("access.status.internal_and_external");
    }

    private sealed class ControlInvitePayload
    {
        public bool Ok { get; set; }

        public string? InviteUrlLan { get; set; }

        public string? InviteUrlExternal { get; set; }
    }

    private sealed class DesktopErrorPayload
    {
        public bool Ok { get; set; }

        public string? Message { get; set; }
    }

    private sealed class DesktopAccessPayload
    {
        public bool Ok { get; set; }

        public string? RoomCode { get; set; }

        public DesktopLinksPayload? Links { get; set; }
    }

    private sealed class DesktopEndpointsPayload
    {
        public bool Ok { get; set; }

        public DesktopUrlPair? Base { get; set; }
    }

    private sealed class DesktopLinksPayload
    {
        public DesktopUrlPair? AppUrl { get; set; }

        public DesktopUrlPair? OverlayViewUrl { get; set; }

        public DesktopUrlPair? OverlayControlUrl { get; set; }
    }

    private sealed class DesktopUrlPair
    {
        public string? Lan { get; set; }

        public string? Public { get; set; }
    }
}
