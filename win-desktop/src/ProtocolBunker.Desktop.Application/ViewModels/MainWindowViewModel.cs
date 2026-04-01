using System.Windows.Input;
using ProtocolBunker.Desktop.Application.Commands;
using ProtocolBunker.Desktop.Contracts.Models;
using ProtocolBunker.Desktop.Contracts.Services;
using System.ComponentModel;
using System.Globalization;
using System.Net;

namespace ProtocolBunker.Desktop.Application.ViewModels;

public sealed class MainWindowViewModel : ViewModelBase
{
    private readonly IRuntimeService _runtimeService;
    private readonly IDesktopSettingsService _desktopSettingsService;
    private readonly IRoomLinkService _roomLinkService;
    private readonly IPlatformShellService _platformShellService;
    private readonly IUpdateService _updateService;
    private readonly ILocalizationService _localizationService;
    private DesktopNavItemViewModel? _selectedSection;
    private bool _isInitialized;
    private string _publicHost;
    private string _domain;
    private string _developerMode;
    private string _selectedLanguage = "auto";
    private string _hostToken = string.Empty;
    private string _viewToken = string.Empty;
    private string _editToken = string.Empty;

    private readonly List<RuntimeLogItemViewModel> _allLogs = [];
    private const int MaxLogEntries = 500;
    private HomeStatusSnapshot? _lastHomeSnapshot;
    private DesktopSettingsModel? _lastSettingsSnapshot;
    private UpdateStatusSnapshot? _lastUpdateSnapshot;
    private RoomLinksSnapshot? _lastLinksSnapshot;
    private CancellationTokenSource? _previewRefreshCts;

    public MainWindowViewModel(
        IRuntimeService runtimeService,
        IDesktopSettingsService desktopSettingsService,
        IRoomLinkService roomLinkService,
        IPlatformShellService platformShellService,
        IUpdateService updateService,
        ILocalizationService localizationService)
    {
        _runtimeService = runtimeService;
        _desktopSettingsService = desktopSettingsService;
        _roomLinkService = roomLinkService;
        _platformShellService = platformShellService;
        _updateService = updateService;
        _localizationService = localizationService;
        T = new DesktopTextCatalog(localizationService);
        T.PropertyChanged += (_, _) =>
        {
            OnPropertyChanged(nameof(T));
            OnPropertyChanged(nameof(SectionTitle));
            OnPropertyChanged(nameof(SectionDescription));
            OnPropertyChanged(nameof(CurrentLanguageLabel));
        };
        _localizationService.LanguageChanged += OnLanguageChanged;
        _runtimeService.OutputReceived += OnRuntimeOutputReceived;
        _runtimeService.StateChanged += OnRuntimeStateChanged;
        _publicHost = T.PlaceholderNotAvailable;
        _domain = T.PlaceholderNotAvailable;
        _developerMode = T.PlaceholderNotAvailable;
        Sections = CreateSections();
        _selectedSection = Sections[0];
        _selectedSection.IsSelected = true;
        SaveSettingsCommand = new AsyncCommand(SaveSettingsAsync);
        SetLanguageAutoCommand = new AsyncCommand(() => SetLanguageAsync("auto"));
        SetLanguageRuCommand = new AsyncCommand(() => SetLanguageAsync("ru"));
        SetLanguageEnCommand = new AsyncCommand(() => SetLanguageAsync("en"));
        StartRuntimeCommand = new AsyncCommand(StartRuntimeAsync);
        StopRuntimeCommand = new AsyncCommand(StopRuntimeAsync);
        CopyAllLogsCommand = new AsyncCommand(CopyAllLogsAsync);
        ClearLogsCommand = new AsyncCommand(ClearLogsAsync);
        RefreshLinksCommand = new AsyncCommand(RefreshLinksAsync);
        CreateControlInviteCommand = new AsyncCommand(CreateControlInviteAsync);
        CopyInternalBaseCommand = new AsyncCommand(() => CopyTextAsync(InternalBaseUrl));
        CopyExternalBaseCommand = new AsyncCommand(() => CopyTextAsync(ExternalBaseUrl));
        OpenInternalBaseCommand = new AsyncCommand(() => OpenUrlAsync(InternalBaseUrl));
        OpenExternalBaseCommand = new AsyncCommand(() => OpenUrlAsync(ExternalBaseUrl));
        CopyPlayerInternalCommand = new AsyncCommand(() => CopyTextAsync(PlayerUrlInternal));
        CopyPlayerExternalCommand = new AsyncCommand(() => CopyTextAsync(PlayerUrlExternal));
        CopyOverlayInternalCommand = new AsyncCommand(() => CopyTextAsync(OverlayUrlInternal));
        CopyOverlayExternalCommand = new AsyncCommand(() => CopyTextAsync(OverlayUrlExternal));
        CopyControlInternalCommand = new AsyncCommand(() => CopyTextAsync(ControlInviteUrlInternal));
        CopyControlExternalCommand = new AsyncCommand(() => CopyTextAsync(ControlInviteUrlExternal));
        OpenPlayerInternalCommand = new AsyncCommand(() => OpenUrlAsync(PlayerUrlInternal));
        OpenPlayerExternalCommand = new AsyncCommand(() => OpenUrlAsync(PlayerUrlExternal));
        OpenOverlayInternalCommand = new AsyncCommand(() => OpenUrlAsync(OverlayUrlInternal));
        OpenOverlayExternalCommand = new AsyncCommand(() => OpenUrlAsync(OverlayUrlExternal));
        OpenControlInternalCommand = new AsyncCommand(() => OpenUrlAsync(ControlInviteUrlInternal));
        OpenControlExternalCommand = new AsyncCommand(() => OpenUrlAsync(ControlInviteUrlExternal));
        OpenDataRootCommand = new AsyncCommand(() => OpenFolderAsync(DataRoot));
        CheckForUpdatesCommand = new AsyncCommand(CheckForUpdatesAsync);
        OpenReleasesPageCommand = new AsyncCommand(OpenReleasesPageAsync);
        OpenSelectedAssetCommand = new AsyncCommand(OpenSelectedAssetAsync);
        Home = new HomeSectionViewModel(
            T,
            StartRuntimeCommand,
            StopRuntimeCommand,
            OpenDataRootCommand,
            OpenPlayerInternalCommand,
            OpenPlayerExternalCommand,
            CopyPlayerInternalCommand,
            CopyPlayerExternalCommand);
        Access = new AccessSectionViewModel(
            T,
            RefreshLinksCommand,
            CreateControlInviteCommand,
            CopyInternalBaseCommand,
            CopyExternalBaseCommand,
            OpenInternalBaseCommand,
            OpenExternalBaseCommand,
            CopyOverlayInternalCommand,
            CopyOverlayExternalCommand,
            OpenOverlayInternalCommand,
            OpenOverlayExternalCommand,
            CopyControlInternalCommand,
            CopyControlExternalCommand,
            OpenControlInternalCommand,
            OpenControlExternalCommand);
        Diagnostics = new DiagnosticsSectionViewModel(T, CopyAllLogsCommand, ClearLogsCommand);
        Diagnostics.PropertyChanged += OnDiagnosticsPropertyChanged;
        Network = new NetworkSectionViewModel(T, SaveSettingsCommand, OpenDataRootCommand);
        Network.PropertyChanged += OnNetworkPropertyChanged;
        Access.PropertyChanged += OnAccessPropertyChanged;
        Updates = new UpdatesSectionViewModel(T, CheckForUpdatesCommand, OpenReleasesPageCommand, OpenSelectedAssetCommand);
    }

    public DesktopTextCatalog T { get; }

    public IReadOnlyList<DesktopNavItemViewModel> Sections { get; }

    public DesktopNavItemViewModel? SelectedSection
    {
        get => _selectedSection;
        set
        {
            if (SetProperty(ref _selectedSection, value))
            {
                UpdateSectionSelection();
                OnSectionChanged();
            }
        }
    }

    public string PublicHost
    {
        get => _publicHost;
        private set => SetProperty(ref _publicHost, value);
    }

    public string Domain
    {
        get => _domain;
        private set => SetProperty(ref _domain, value);
    }

    public string DeveloperMode
    {
        get => _developerMode;
        private set => SetProperty(ref _developerMode, value);
    }

    public string SelectedLanguage
    {
        get => _selectedLanguage;
        private set => SetProperty(ref _selectedLanguage, value);
    }

    public string CurrentLanguageLabel => SelectedLanguage switch
    {
        "ru" => T.LanguageRu,
        "en" => T.LanguageEn,
        _ => T.LanguageAuto,
    };

    public bool IsLanguageAutoSelected => SelectedLanguage == "auto";

    public bool IsLanguageRuSelected => SelectedLanguage == "ru";

    public bool IsLanguageEnSelected => SelectedLanguage == "en";

    public ICommand SaveSettingsCommand { get; }

    public ICommand SetLanguageAutoCommand { get; }

    public ICommand SetLanguageRuCommand { get; }

    public ICommand SetLanguageEnCommand { get; }

    public ICommand StartRuntimeCommand { get; }

    public ICommand StopRuntimeCommand { get; }

    public ICommand CopyAllLogsCommand { get; }

    public ICommand ClearLogsCommand { get; }

    public ICommand RefreshLinksCommand { get; }

    public ICommand CreateControlInviteCommand { get; }

    public ICommand CopyInternalBaseCommand { get; }

    public ICommand CopyExternalBaseCommand { get; }

    public ICommand CopyPlayerInternalCommand { get; }

    public ICommand CopyPlayerExternalCommand { get; }

    public ICommand OpenInternalBaseCommand { get; }

    public ICommand OpenExternalBaseCommand { get; }

    public ICommand CopyOverlayInternalCommand { get; }

    public ICommand CopyOverlayExternalCommand { get; }

    public ICommand CopyControlInternalCommand { get; }

    public ICommand CopyControlExternalCommand { get; }

    public ICommand OpenPlayerInternalCommand { get; }

    public ICommand OpenPlayerExternalCommand { get; }

    public ICommand OpenOverlayInternalCommand { get; }

    public ICommand OpenOverlayExternalCommand { get; }

    public ICommand OpenControlInternalCommand { get; }

    public ICommand OpenControlExternalCommand { get; }

    public ICommand OpenDataRootCommand { get; }

    public ICommand CheckForUpdatesCommand { get; }

    public ICommand OpenReleasesPageCommand { get; }

    public ICommand OpenSelectedAssetCommand { get; }

    public HomeSectionViewModel Home { get; }

    public AccessSectionViewModel Access { get; }

    public DiagnosticsSectionViewModel Diagnostics { get; }

    public NetworkSectionViewModel Network { get; }

    public UpdatesSectionViewModel Updates { get; }

    public string Version => Home.Version;

    public string ProcessId => Home.ProcessId;

    public string DataRoot => Home.DataRoot;

    public string InternalBaseUrl => Access.InternalBaseUrl;

    public string ExternalBaseUrl => Access.ExternalBaseUrl;

    public string PlayerUrlInternal => Home.PlayerUrlInternal;

    public string PlayerUrlExternal => Home.PlayerUrlExternal;

    public string OverlayUrlInternal => Access.OverlayUrlInternal;

    public string OverlayUrlExternal => Access.OverlayUrlExternal;

    public string ControlInviteUrlInternal => Access.ControlInviteUrlInternal;

    public string ControlInviteUrlExternal => Access.ControlInviteUrlExternal;

    public object CurrentSectionContent => SelectedSection?.Section switch
    {
        DesktopSection.Home => Home,
        DesktopSection.Access => Access,
        DesktopSection.Network => Network,
        DesktopSection.Diagnostics => Diagnostics,
        DesktopSection.Updates => Updates,
        _ => Home,
    };

    public string SectionTitle => SelectedSection?.Title ?? T.ShellTitle;

    public string SectionDescription => SelectedSection is null
        ? T.ShellIntro
        : T.SectionDescription(SelectedSection.Section);

    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        var settings = await _desktopSettingsService.LoadAsync(cancellationToken);
        SelectedLanguage = settings.Language;
        _localizationService.SetLanguage(settings.Language);
        Apply(settings);

        var runtime = await _runtimeService.GetHomeStatusAsync(settings, cancellationToken);
        Apply(runtime);
        await RefreshLinksAsync(settings);
        Apply(await _updateService.GetStatusAsync(cancellationToken));
        _isInitialized = true;
    }

    private void Apply(HomeStatusSnapshot snapshot)
    {
        _lastHomeSnapshot = snapshot;
        Home.Version = ToDisplay(snapshot.Version);
        Home.RuntimeState = LocalizeRuntimeState(snapshot.RuntimeState);
        Home.ActiveMode = LocalizeMode(snapshot.ActiveMode);
        Home.Port = snapshot.Port > 0 ? snapshot.Port.ToString(CultureInfo.InvariantCulture) : T.PlaceholderNotAvailable;
        Home.RoomCode = ToDisplay(snapshot.RoomCode);
        Home.Reachability = ToDisplay(snapshot.ReachabilitySummary);
        Home.RuntimeSource = ToDisplay(snapshot.RuntimeSource);
        Home.InstallRoot = ToDisplay(snapshot.InstallRoot);
        Home.AppRoot = ToDisplay(snapshot.AppRoot);
        Home.DataRoot = ToDisplay(snapshot.DataRoot);
        Home.ProcessId = snapshot.ProcessId?.ToString(CultureInfo.InvariantCulture) ?? T.PlaceholderNotAvailable;
        Home.StatusDetail = ToDisplay(snapshot.StatusDetail);
        Network.IsSettingsLocked = snapshot.RuntimeState == RuntimeState.Running || snapshot.RuntimeState == RuntimeState.Starting || snapshot.RuntimeState == RuntimeState.Stopping;
        Network.LockReason = Network.IsSettingsLocked ? T.NetworkLockedHint : string.Empty;
        OnPropertyChanged(nameof(Version));
        OnPropertyChanged(nameof(ProcessId));
        OnPropertyChanged(nameof(DataRoot));
    }

    private void Apply(DesktopSettingsModel settings)
    {
        _lastSettingsSnapshot = settings;
        Home.ActiveMode = string.IsNullOrWhiteSpace(settings.Mode) ? Home.ActiveMode : LocalizeMode(settings.Mode);
        Home.Port = settings.Port > 0 ? settings.Port.ToString() : Home.Port;
        Home.RoomCode = string.IsNullOrWhiteSpace(settings.RoomCode) ? Home.RoomCode : settings.RoomCode;
        Home.DataRoot = string.IsNullOrWhiteSpace(settings.DataFolder) ? Home.DataRoot : settings.DataFolder;
        PublicHost = ToDisplay(settings.PublicHost);
        Domain = ToDisplay(settings.Domain);
        DeveloperMode = settings.DeveloperMode ? T["status.on"] : T["status.off"];
        Home.PublicHost = PublicHost;
        Home.Domain = Domain;
        Home.DeveloperMode = DeveloperMode;
        Home.Reachability = BuildReachabilityPreview(settings);
        SelectedLanguage = settings.Language;
        OnPropertyChanged(nameof(CurrentLanguageLabel));
        OnPropertyChanged(nameof(IsLanguageAutoSelected));
        OnPropertyChanged(nameof(IsLanguageRuSelected));
        OnPropertyChanged(nameof(IsLanguageEnSelected));
        _hostToken = settings.HostToken ?? string.Empty;
        _viewToken = settings.ViewToken ?? string.Empty;
        _editToken = settings.EditToken ?? string.Empty;

        Network.EditableMode = string.IsNullOrWhiteSpace(settings.Mode) ? "local" : settings.Mode;
        Network.EditablePort = settings.Port > 0 ? settings.Port.ToString() : "8080";
        Network.EditablePublicHost = settings.PublicHost;
        Network.EditableDomain = settings.Domain;
        Network.EditableDataRoot = settings.DataFolder;
        Access.EditableRoomCode = settings.RoomCode;
        Network.EditableDeveloperMode = settings.DeveloperMode;
        Network.SettingsStatus = T["status.settings_loaded"];
        OnPropertyChanged(nameof(DataRoot));
    }

    private void Apply(UpdateStatusSnapshot snapshot)
    {
        _lastUpdateSnapshot = snapshot;
        Updates.CurrentVersion = ToDisplay(snapshot.CurrentVersion);
        Updates.LatestVersion = ToDisplay(snapshot.LatestVersion);
        Updates.SelectedAssetName = ToDisplay(snapshot.SelectedAssetName);
        Updates.SelectedAssetUrl = snapshot.SelectedAssetUrl;
        Updates.IsUpdateAvailable = snapshot.IsUpdateAvailable;
        Updates.AvailabilityText = snapshot.IsUpdateAvailable ? T["status.yes"] : T["status.no"];
        Updates.CanOpenSelectedAsset = !string.IsNullOrWhiteSpace(snapshot.SelectedAssetUrl);
        Updates.StatusMessage = ToDisplay(snapshot.StatusMessage);
    }

    private void OnSectionChanged()
    {
        OnPropertyChanged(nameof(SectionTitle));
        OnPropertyChanged(nameof(SectionDescription));
        OnPropertyChanged(nameof(CurrentSectionContent));
    }

    private IReadOnlyList<DesktopNavItemViewModel> CreateSections()
    {
        var sections = new List<DesktopNavItemViewModel>();
        foreach (var section in new[]
                 {
                     DesktopSection.Home,
                     DesktopSection.Access,
                     DesktopSection.Network,
                     DesktopSection.Diagnostics,
                     DesktopSection.Updates,
                 })
        {
            DesktopNavItemViewModel? item = null;
            item = new DesktopNavItemViewModel(
                section,
                T,
                new AsyncCommand(() =>
                {
                    SelectedSection = item;
                    return Task.CompletedTask;
                }));
            sections.Add(item);
        }

        return sections;
    }

    private void UpdateSectionSelection()
    {
        foreach (var section in Sections)
        {
            section.IsSelected = ReferenceEquals(section, _selectedSection);
        }
    }

    private void OnDiagnosticsPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(DiagnosticsSectionViewModel.LogSearchText))
        {
            RefreshVisibleLogs();
        }
    }

    private async Task SaveSettingsAsync()
    {
        var settings = TryBuildCurrentSettings(out var validationError);
        if (settings is null)
        {
            Network.SettingsStatus = validationError ?? T["status.settings_invalid"];
            return;
        }

        var previousSettings = _lastSettingsSnapshot ?? await _desktopSettingsService.LoadAsync();
        await _desktopSettingsService.SaveAsync(settings);
        Apply(settings);

        var restartRequired = RequiresServerRestart(previousSettings, settings);
        if (_lastHomeSnapshot?.RuntimeState == RuntimeState.Running && restartRequired)
        {
            var stopResult = await _runtimeService.StopAsync();
            var startResult = await _runtimeService.StartAsync(settings);
            Network.SettingsStatus = stopResult.Success && startResult.Success
                ? T["status.settings_saved_restarted"]
                : string.Format(
                    CultureInfo.CurrentUICulture,
                    T["status.settings_saved_restart_failed"],
                    startResult.Message);
        }
        else
        {
            Network.SettingsStatus = restartRequired
                ? T["status.settings_saved_restart_needed"]
                : T["status.settings_saved"];
        }

        var runtimeSnapshot = await _runtimeService.GetHomeStatusAsync(settings);
        Apply(runtimeSnapshot);
        await RefreshLinksAsync(settings);
    }

    private static string NormalizeMode(string? mode)
    {
        return string.Equals(mode?.Trim(), "domain", StringComparison.OrdinalIgnoreCase)
            ? "domain"
            : "local";
    }

    private string LocalizeMode(string? mode)
    {
        return NormalizeMode(mode) switch
        {
            "domain" => T.ModeDomain,
            _ => T.ModeLocal,
        };
    }

    private string LocalizeRuntimeState(RuntimeState state) => state switch
    {
        RuntimeState.Stopped => T["runtime_state.stopped"],
        RuntimeState.Starting => T["runtime_state.starting"],
        RuntimeState.Running => T["runtime_state.running"],
        RuntimeState.Stopping => T["runtime_state.stopping"],
        RuntimeState.Error => T["runtime_state.error"],
        _ => state.ToString(),
    };

    private async Task StartRuntimeAsync()
    {
        var settings = TryBuildCurrentSettings(out var validationError);
        if (settings is null)
        {
            Network.SettingsStatus = validationError ?? T["status.settings_invalid"];
            return;
        }

        await _desktopSettingsService.SaveAsync(settings);
        Apply(settings);
        var result = await _runtimeService.StartAsync(settings);
        Network.SettingsStatus = result.Message;
        var snapshot = await _runtimeService.GetHomeStatusAsync(settings);
        Apply(snapshot);
        await RefreshLinksAsync(settings);
    }

    private async Task StopRuntimeAsync()
    {
        var result = await _runtimeService.StopAsync();
        Network.SettingsStatus = result.Message;
        var settings = TryBuildCurrentSettings(out _) ?? _lastSettingsSnapshot;
        var snapshot = await _runtimeService.GetHomeStatusAsync(settings);
        Apply(snapshot);
        await RefreshLinksAsync(settings);
    }

    private Task ClearLogsAsync()
    {
        _allLogs.Clear();
        Diagnostics.VisibleLogs.Clear();
        Network.SettingsStatus = T["status.diagnostics_cleared"];
        return Task.CompletedTask;
    }

    private async Task CopyAllLogsAsync()
    {
        if (_allLogs.Count == 0)
        {
            Network.SettingsStatus = T["status.nothing_to_copy"];
            return;
        }

        var payload = string.Join(
            Environment.NewLine,
            _allLogs.Select(item => $"[{item.Timestamp}] {item.Level} {item.Text}"));

        try
        {
            await _platformShellService.CopyTextAsync(payload);
            Network.SettingsStatus = T["status.copied"];
        }
        catch (Exception ex)
        {
            Network.SettingsStatus = string.Format(CultureInfo.CurrentUICulture, T["status.copy_failed"], ex.Message);
        }
    }

    private void OnRuntimeOutputReceived(object? sender, RuntimeOutputEventArgs e)
    {
        var item = new RuntimeLogItemViewModel
        {
            Timestamp = e.Entry.Timestamp.ToLocalTime().ToString("HH:mm:ss"),
            Text = e.Entry.Text,
            Level = e.Entry.IsError ? "ERR" : "OUT",
        };

        _allLogs.Add(item);
        if (_allLogs.Count > MaxLogEntries)
        {
            _allLogs.RemoveAt(0);
        }

        RefreshVisibleLogs();
    }

    private async void OnRuntimeStateChanged(object? sender, EventArgs e)
    {
        try
        {
            var settings = TryBuildCurrentSettings(out _) ?? _lastSettingsSnapshot;
            if (settings is null)
            {
                return;
            }

            var snapshot = await _runtimeService.GetHomeStatusAsync(settings);
            Apply(snapshot);
            await RefreshLinksAsync(settings);
        }
        catch
        {
        }
    }

    private void RefreshVisibleLogs()
    {
        var query = (Diagnostics.LogSearchText ?? string.Empty).Trim();
        Diagnostics.VisibleLogs.Clear();

        IEnumerable<RuntimeLogItemViewModel> items = _allLogs;
        if (query.Length > 0)
        {
            items = items.Where(item =>
                item.Text.Contains(query, StringComparison.OrdinalIgnoreCase) ||
                item.Level.Contains(query, StringComparison.OrdinalIgnoreCase));
        }

        foreach (var item in items)
        {
            Diagnostics.VisibleLogs.Add(item);
        }
    }

    private async Task RefreshLinksAsync()
        => await RefreshLinksAsync(TryBuildCurrentSettings(out _) ?? _lastSettingsSnapshot);

    private async Task RefreshLinksAsync(DesktopSettingsModel? settingsOverride)
    {
        if (settingsOverride is null)
        {
            return;
        }

        var snapshot = await _roomLinkService.BuildAsync(settingsOverride);
        _lastLinksSnapshot = snapshot;
        if (!string.IsNullOrWhiteSpace(snapshot.RoomCode))
        {
            Access.EditableRoomCode = snapshot.RoomCode;
            Home.RoomCode = snapshot.RoomCode;
        }
        Access.InternalBaseUrl = ToDisplay(snapshot.InternalBaseUrl);
        Access.ExternalBaseUrl = ToDisplay(snapshot.ExternalBaseUrl);
        Home.PlayerUrlInternal = ToDisplay(snapshot.InternalBaseUrl);
        Home.PlayerUrlExternal = ToDisplay(snapshot.ExternalBaseUrl);
        Access.OverlayUrlInternal = ToDisplay(snapshot.OverlayUrlInternal);
        Access.OverlayUrlExternal = ToDisplay(snapshot.OverlayUrlExternal);
        Access.ControlInviteUrlInternal = ToDisplay(snapshot.ControlInviteUrlInternal);
        Access.ControlInviteUrlExternal = ToDisplay(snapshot.ControlInviteUrlExternal);
        Access.AccessStatus = snapshot.StatusMessage;
    }

    private async Task CreateControlInviteAsync()
    {
        var settings = TryBuildCurrentSettings(out var validationError);
        if (settings is null)
        {
            Access.AccessStatus = validationError ?? T["status.settings_invalid"];
            return;
        }

        var result = await _roomLinkService.CreateControlInviteAsync(settings);
        Access.AccessStatus = result.Message;
        if (result.Success)
        {
            Access.ControlInviteUrlInternal = ToDisplay(result.InviteUrlInternal);
            Access.ControlInviteUrlExternal = ToDisplay(result.InviteUrlExternal);
        }
    }

    private string ToDisplay(string? value)
    {
        return IsPlaceholderValue(value) ? T.PlaceholderNotAvailable : value!;
    }

    private async Task CopyTextAsync(string value)
    {
        var normalized = NormalizeDisplayValue(value);
        if (normalized is null)
        {
            Access.AccessStatus = T["status.nothing_to_copy"];
            return;
        }

        try
        {
            await _platformShellService.CopyTextAsync(normalized);
            Access.AccessStatus = T["status.copied"];
        }
        catch (Exception ex)
        {
            Access.AccessStatus = string.Format(CultureInfo.CurrentUICulture, T["status.copy_failed"], ex.Message);
        }
    }

    private async Task OpenUrlAsync(string value)
    {
        var normalized = NormalizeDisplayValue(value);
        if (normalized is null)
        {
            Access.AccessStatus = T["status.url_unavailable"];
            return;
        }

        try
        {
            await _platformShellService.OpenUrlAsync(normalized);
            Access.AccessStatus = T["status.opened_in_browser"];
        }
        catch (Exception ex)
        {
            Access.AccessStatus = string.Format(CultureInfo.CurrentUICulture, T["status.open_failed"], ex.Message);
        }
    }

    private async Task OpenFolderAsync(string value)
    {
        var normalized = NormalizeDisplayValue(value);
        if (normalized is null)
        {
            Network.SettingsStatus = T["status.folder_unavailable"];
            return;
        }

        try
        {
            await _platformShellService.OpenFolderAsync(normalized);
            Network.SettingsStatus = T["status.folder_opened"];
        }
        catch (Exception ex)
        {
            Network.SettingsStatus = string.Format(CultureInfo.CurrentUICulture, T["status.open_folder_failed"], ex.Message);
        }
    }

    private string? NormalizeDisplayValue(string? value)
    {
        var trimmed = (value ?? string.Empty).Trim();
        if (trimmed.Length == 0 || trimmed == "-" || IsPlaceholderValue(trimmed))
        {
            return null;
        }

        return trimmed;
    }

    private bool IsPlaceholderValue(string? value)
    {
        var trimmed = (value ?? string.Empty).Trim();
        return trimmed.Length == 0 ||
               trimmed == "-" ||
               trimmed == T.PlaceholderNotAvailable ||
               trimmed == T.PlaceholderLoading ||
               string.Equals(trimmed, "Не задано", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(trimmed, "Not set", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(trimmed, "Загрузка...", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(trimmed, "Loading...", StringComparison.OrdinalIgnoreCase);
    }

    private async Task CheckForUpdatesAsync()
    {
        try
        {
            Apply(await _updateService.CheckForUpdatesAsync());
        }
        catch (Exception ex)
        {
            Updates.StatusMessage = string.Format(CultureInfo.CurrentUICulture, T["status.update_check_failed"], ex.Message);
        }
    }

    private async Task OpenReleasesPageAsync()
    {
        try
        {
            await _updateService.OpenReleasesPageAsync();
            Updates.StatusMessage = T["status.opened_releases"];
        }
        catch (Exception ex)
        {
            Updates.StatusMessage = string.Format(CultureInfo.CurrentUICulture, T["status.open_releases_failed"], ex.Message);
        }
    }

    private async Task OpenSelectedAssetAsync()
    {
        if (string.IsNullOrWhiteSpace(Updates.SelectedAssetUrl))
        {
            Updates.StatusMessage = T["status.no_selected_asset"];
            return;
        }

        try
        {
            await _updateService.OpenSelectedAssetAsync(Updates.SelectedAssetUrl);
            Updates.StatusMessage = T["status.opened_selected_asset"];
        }
        catch (Exception ex)
        {
            Updates.StatusMessage = string.Format(CultureInfo.CurrentUICulture, T["status.open_asset_failed"], ex.Message);
        }
    }

    private async Task SetLanguageAsync(string language)
    {
        var currentSettings = await _desktopSettingsService.LoadAsync();
        var normalized = string.IsNullOrWhiteSpace(language) ? "auto" : language.Trim().ToLowerInvariant();
        var updated = currentSettings with { Language = normalized };
        await _desktopSettingsService.SaveAsync(updated);
        SelectedLanguage = normalized;
        OnPropertyChanged(nameof(CurrentLanguageLabel));
        OnPropertyChanged(nameof(IsLanguageAutoSelected));
        OnPropertyChanged(nameof(IsLanguageRuSelected));
        OnPropertyChanged(nameof(IsLanguageEnSelected));
        _localizationService.SetLanguage(normalized);
        Network.SettingsStatus = T["status.language_saved"];
    }

    private async void OnLanguageChanged(object? sender, EventArgs e)
    {
        if (!_isInitialized)
        {
            return;
        }

        await RefreshLocalizedSurfaceAsync();
    }

    private async Task RefreshLocalizedSurfaceAsync()
    {
        var currentSettings = TryBuildCurrentSettings(out _) ?? _lastSettingsSnapshot;
        var runtimeTask = _runtimeService.GetHomeStatusAsync(currentSettings);
        var settingsTask = _desktopSettingsService.LoadAsync();
        var updatesTask = _updateService.GetStatusAsync();
        await Task.WhenAll(runtimeTask, settingsTask, updatesTask);
        Apply(await runtimeTask);
        Apply(await settingsTask);
        Apply(await updatesTask);
        await RefreshLinksAsync(currentSettings);
    }

    private string? ValidateNetworkSettings(string mode, string publicHost, string domain, bool developerMode)
    {
        if (mode == "domain" && domain.Length == 0)
        {
            return T["status.domain_required"];
        }

        if (publicHost.Length > 0 && !IsValidHostOrIp(publicHost))
        {
            return string.Format(CultureInfo.CurrentUICulture, T["status.public_host_invalid"], publicHost);
        }

        if (domain.Length > 0 && !IsValidHostOrIp(domain))
        {
            return string.Format(CultureInfo.CurrentUICulture, T["status.domain_invalid"], domain);
        }

        if (!developerMode && ((domain.Length > 0 && IsLocalHostValue(domain)) || (publicHost.Length > 0 && IsLocalHostValue(publicHost))))
        {
            return T["status.localhost_only_in_dev"];
        }

        return null;
    }

    private string BuildReachabilityPreview(DesktopSettingsModel settings)
    {
        var mode = NormalizeMode(settings.Mode);
        if (mode == "domain")
        {
            return string.IsNullOrWhiteSpace(settings.Domain)
                ? T["runtime.reachability.domain_missing"]
                : string.Format(CultureInfo.CurrentUICulture, T["runtime.reachability.domain_mode"], settings.Domain.Trim());
        }

        if (!string.IsNullOrWhiteSpace(settings.PublicHost))
        {
            return string.Format(CultureInfo.CurrentUICulture, T["runtime.reachability.local_external"], settings.PublicHost.Trim(), settings.Port);
        }

        return settings.DeveloperMode
            ? T["runtime.reachability.dev_local"]
            : T["runtime.reachability.standard_local"];
    }

    private DesktopSettingsModel? TryBuildCurrentSettings(out string? validationError)
    {
        validationError = null;
        if (!int.TryParse(Network.EditablePort, out var port) || port is < 1 or > 65535)
        {
            validationError = T["status.port_invalid"];
            return null;
        }

        var normalizedMode = NormalizeMode(Network.EditableMode);
        var normalizedPublicHost = NormalizeHost(Network.EditablePublicHost);
        var normalizedDomain = NormalizeHost(Network.EditableDomain);
        validationError = ValidateNetworkSettings(normalizedMode, normalizedPublicHost, normalizedDomain, Network.EditableDeveloperMode);
        if (!string.IsNullOrWhiteSpace(validationError))
        {
            return null;
        }

        return new DesktopSettingsModel(
            Language: SelectedLanguage,
            Mode: normalizedMode,
            Port: port,
            PublicHost: normalizedPublicHost,
            Domain: normalizedDomain,
            DataFolder: string.IsNullOrWhiteSpace(Network.EditableDataRoot) ? "app/data" : Network.EditableDataRoot.Trim(),
            RoomCode: (Access.EditableRoomCode ?? string.Empty).Trim().ToUpperInvariant(),
            DeveloperMode: Network.EditableDeveloperMode,
            HostToken: _hostToken,
            ViewToken: _viewToken,
            EditToken: _editToken);
    }

    private void OnNetworkPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (!_isInitialized)
        {
            return;
        }

        if (e.PropertyName is nameof(NetworkSectionViewModel.EditableMode) or
            nameof(NetworkSectionViewModel.EditablePort) or
            nameof(NetworkSectionViewModel.EditablePublicHost) or
            nameof(NetworkSectionViewModel.EditableDomain) or
            nameof(NetworkSectionViewModel.EditableDataRoot) or
            nameof(NetworkSectionViewModel.EditableDeveloperMode))
        {
            ApplyPreviewSettings();
            SchedulePreviewRefresh();
        }
    }

    private void OnAccessPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (!_isInitialized)
        {
            return;
        }

        if (e.PropertyName == nameof(AccessSectionViewModel.EditableRoomCode))
        {
            ApplyPreviewSettings();
            SchedulePreviewRefresh();
        }
    }

    private void ApplyPreviewSettings()
    {
        var settings = TryBuildCurrentSettings(out _);
        if (settings is null)
        {
            return;
        }

        Apply(settings);
    }

    private void SchedulePreviewRefresh()
    {
        _previewRefreshCts?.Cancel();
        _previewRefreshCts?.Dispose();
        _previewRefreshCts = new CancellationTokenSource();
        var token = _previewRefreshCts.Token;

        _ = Task.Run(async () =>
        {
            try
            {
                await Task.Delay(250, token);
                var settings = TryBuildCurrentSettings(out _);
                if (settings is null)
                {
                    return;
                }

                var runtimeSnapshot = await _runtimeService.GetHomeStatusAsync(settings, token);
                var linksSnapshot = await _roomLinkService.BuildAsync(settings, token);
                if (token.IsCancellationRequested)
                {
                    return;
                }

                Apply(runtimeSnapshot);
                _lastLinksSnapshot = linksSnapshot;
                if (!string.IsNullOrWhiteSpace(linksSnapshot.RoomCode))
                {
                    Home.RoomCode = linksSnapshot.RoomCode;
                }
                Access.InternalBaseUrl = ToDisplay(linksSnapshot.InternalBaseUrl);
                Access.ExternalBaseUrl = ToDisplay(linksSnapshot.ExternalBaseUrl);
                Home.PlayerUrlInternal = ToDisplay(linksSnapshot.InternalBaseUrl);
                Home.PlayerUrlExternal = ToDisplay(linksSnapshot.ExternalBaseUrl);
                Access.OverlayUrlInternal = ToDisplay(linksSnapshot.OverlayUrlInternal);
                Access.OverlayUrlExternal = ToDisplay(linksSnapshot.OverlayUrlExternal);
                Access.ControlInviteUrlInternal = ToDisplay(linksSnapshot.ControlInviteUrlInternal);
                Access.ControlInviteUrlExternal = ToDisplay(linksSnapshot.ControlInviteUrlExternal);
                Access.AccessStatus = ToDisplay(linksSnapshot.StatusMessage);
            }
            catch (OperationCanceledException)
            {
            }
            catch
            {
            }
        }, token);
    }

    private static bool RequiresServerRestart(DesktopSettingsModel previous, DesktopSettingsModel current)
    {
        return previous.Port != current.Port ||
               !string.Equals(NormalizeMode(previous.Mode), NormalizeMode(current.Mode), StringComparison.OrdinalIgnoreCase) ||
               !string.Equals(previous.PublicHost ?? string.Empty, current.PublicHost ?? string.Empty, StringComparison.OrdinalIgnoreCase) ||
               !string.Equals(previous.Domain ?? string.Empty, current.Domain ?? string.Empty, StringComparison.OrdinalIgnoreCase) ||
               !string.Equals(previous.DataFolder ?? string.Empty, current.DataFolder ?? string.Empty, StringComparison.Ordinal) ||
               previous.DeveloperMode != current.DeveloperMode;
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

    private static bool IsValidHostOrIp(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        if (IPAddress.TryParse(value, out _))
        {
            return true;
        }

        var host = value.Trim();
        if (host.EndsWith(".", StringComparison.Ordinal))
        {
            host = host[..^1];
        }

        if (host.Length is < 1 or > 253)
        {
            return false;
        }

        var labels = host.Split('.', StringSplitOptions.RemoveEmptyEntries);
        if (labels.Length == 0)
        {
            return false;
        }

        return labels.All(static label =>
            label.Length is > 0 and <= 63 &&
            label[0] != '-' &&
            label[^1] != '-' &&
            label.All(static ch => char.IsLetterOrDigit(ch) || ch == '-'));
    }
}
