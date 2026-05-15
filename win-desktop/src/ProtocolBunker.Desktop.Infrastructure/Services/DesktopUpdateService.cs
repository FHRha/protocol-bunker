using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Globalization;
using ProtocolBunker.Desktop.Contracts.Models;
using ProtocolBunker.Desktop.Contracts.Services;

namespace ProtocolBunker.Desktop.Infrastructure.Services;

public sealed class DesktopUpdateService : IUpdateService
{
    private const string ReleasesApi = "https://api.github.com/repos/FHRha/protocol-bunker/releases/latest";
    private const string ReleasesPage = "https://github.com/FHRha/protocol-bunker/releases/latest";
    private static readonly Regex PreferredAssetPattern = new(
        "^protocol-bunker-win-x64-desktop(?:-v[0-9A-Za-z.-]+)?\\.zip$",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private readonly IRuntimeService _runtimeService;
    private readonly IPlatformShellService _platformShellService;
    private readonly ILocalizationService _localizationService;
    private readonly HttpClient _httpClient;
    private UpdateStatusSnapshot _lastSnapshot;

    public DesktopUpdateService(
        IRuntimeService runtimeService,
        IPlatformShellService platformShellService,
        ILocalizationService localizationService)
    {
        _runtimeService = runtimeService;
        _platformShellService = platformShellService;
        _localizationService = localizationService;
        _httpClient = new HttpClient();
        _httpClient.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("ProtocolBunkerDesktop", "0.3.1"));
        var placeholder = _localizationService.Get("placeholder.not_available");
        _lastSnapshot = new UpdateStatusSnapshot(
            CurrentVersion: placeholder,
            LatestVersion: placeholder,
            SelectedAssetName: placeholder,
            SelectedAssetUrl: string.Empty,
            ReleasesPageUrl: ReleasesPage,
            IsUpdateAvailable: false,
            StatusMessage: placeholder);
    }

    public async Task<UpdateStatusSnapshot> GetStatusAsync(CancellationToken cancellationToken = default)
    {
        if (_lastSnapshot.CurrentVersion == _localizationService.Get("placeholder.not_available"))
        {
            var current = await ReadCurrentVersionAsync(cancellationToken);
            _lastSnapshot = _lastSnapshot with { CurrentVersion = current };
        }

        return _lastSnapshot;
    }

    public async Task<UpdateStatusSnapshot> CheckForUpdatesAsync(CancellationToken cancellationToken = default)
    {
        var current = await ReadCurrentVersionAsync(cancellationToken);

        using var response = await _httpClient.GetAsync(ReleasesApi, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var placeholder = _localizationService.Get("placeholder.not_available");
            _lastSnapshot = new UpdateStatusSnapshot(
                CurrentVersion: current,
                LatestVersion: placeholder,
                SelectedAssetName: placeholder,
                SelectedAssetUrl: string.Empty,
                ReleasesPageUrl: ReleasesPage,
                IsUpdateAvailable: false,
                StatusMessage: string.Format(
                    CultureInfo.CurrentUICulture,
                    _localizationService.Get("updates.status.request_failed"),
                    (int)response.StatusCode,
                    response.ReasonPhrase ?? string.Empty));
            return _lastSnapshot;
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        var root = doc.RootElement;

        var tag = root.TryGetProperty("tag_name", out var tagElement)
            ? tagElement.GetString() ?? string.Empty
            : string.Empty;

        if (string.IsNullOrWhiteSpace(tag))
        {
            var placeholder = _localizationService.Get("placeholder.not_available");
            _lastSnapshot = new UpdateStatusSnapshot(
                CurrentVersion: current,
                LatestVersion: placeholder,
                SelectedAssetName: placeholder,
                SelectedAssetUrl: string.Empty,
                ReleasesPageUrl: ReleasesPage,
                IsUpdateAvailable: false,
                StatusMessage: _localizationService.Get("updates.status.tag_missing"));
            return _lastSnapshot;
        }

        var latest = NormalizeVersionForCompare(tag);
        var currentNormalized = NormalizeVersionForCompare(current);

        var placeholderName = _localizationService.Get("placeholder.not_available");
        string selectedAssetName = placeholderName;
        string selectedAssetUrl = string.Empty;

        if (root.TryGetProperty("assets", out var assets) && assets.ValueKind == JsonValueKind.Array)
        {
            foreach (var asset in assets.EnumerateArray())
            {
                var name = asset.GetProperty("name").GetString() ?? string.Empty;
                if (!PreferredAssetPattern.IsMatch(name))
                {
                    continue;
                }

                selectedAssetName = name;
                selectedAssetUrl = asset.GetProperty("browser_download_url").GetString() ?? string.Empty;
                break;
            }
        }

        var isUpdateAvailable =
            currentNormalized.Length > 0 &&
            latest.Length > 0 &&
            !string.Equals(currentNormalized, latest, StringComparison.OrdinalIgnoreCase);

        var statusMessage = isUpdateAvailable
            ? string.Format(CultureInfo.CurrentUICulture, _localizationService.Get("updates.status.update_available"), tag)
            : string.Format(CultureInfo.CurrentUICulture, _localizationService.Get("updates.status.up_to_date"), current);

        if (selectedAssetName == placeholderName)
        {
            statusMessage = isUpdateAvailable
                ? string.Format(CultureInfo.CurrentUICulture, _localizationService.Get("updates.status.asset_missing"), tag)
                : statusMessage;
        }

        _lastSnapshot = new UpdateStatusSnapshot(
            CurrentVersion: current,
            LatestVersion: tag,
            SelectedAssetName: selectedAssetName,
            SelectedAssetUrl: selectedAssetUrl,
            ReleasesPageUrl: ReleasesPage,
            IsUpdateAvailable: isUpdateAvailable,
            StatusMessage: statusMessage);
        return _lastSnapshot;
    }

    public Task OpenReleasesPageAsync(CancellationToken cancellationToken = default)
    {
        return _platformShellService.OpenUrlAsync(ReleasesPage, cancellationToken);
    }

    public Task OpenSelectedAssetAsync(string assetUrl, CancellationToken cancellationToken = default)
    {
        return _platformShellService.OpenUrlAsync(assetUrl, cancellationToken);
    }

    private async Task<string> ReadCurrentVersionAsync(CancellationToken cancellationToken)
    {
        var snapshot = await _runtimeService.GetHomeStatusAsync(cancellationToken: cancellationToken);
        return string.IsNullOrWhiteSpace(snapshot.Version)
            ? _localizationService.Get("placeholder.not_available")
            : snapshot.Version;
    }

    private static string NormalizeVersionForCompare(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return string.Empty;
        }

        var value = raw.Trim();
        while (value.StartsWith("v", StringComparison.OrdinalIgnoreCase))
        {
            value = value[1..].TrimStart();
        }

        return value;
    }
}
