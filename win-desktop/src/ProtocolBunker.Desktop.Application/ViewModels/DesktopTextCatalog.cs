using ProtocolBunker.Desktop.Contracts.Models;
using ProtocolBunker.Desktop.Contracts.Services;

namespace ProtocolBunker.Desktop.Application.ViewModels;

public sealed class DesktopTextCatalog : ViewModelBase
{
    private readonly ILocalizationService _localizationService;

    public DesktopTextCatalog(ILocalizationService localizationService)
    {
        _localizationService = localizationService;
        _localizationService.LanguageChanged += (_, _) => OnPropertyChanged(string.Empty);
    }

    public string this[string key] => _localizationService.Get(key);

    public string ShellBadge => this["shell.badge"];
    public string ShellTitle => this["shell.title"];
    public string ShellIntro => this["shell.intro"];
    public string ShellLanguage => this["shell.language"];
    public string LanguageAuto => this["language.auto"];
    public string LanguageRu => this["language.ru"];
    public string LanguageEn => this["language.en"];
    public string SidebarSections => this["shell.sidebar.sections"];
    public string SidebarRuntime => this["shell.sidebar.runtime"];
    public string SidebarState => this["shell.sidebar.state"];
    public string SidebarPortRoom => this["shell.sidebar.port_room"];
    public string SidebarModeDev => this["shell.sidebar.mode_dev"];
    public string SidebarStatus => this["shell.sidebar.status"];
    public string HeaderBuildIdentity => this["shell.header.build_identity"];
    public string HeaderRuntimePid => this["shell.header.runtime_pid"];
    public string ShellBanner => this["shell.banner"];
    public string PlaceholderNotAvailable => this["placeholder.not_available"];
    public string PlaceholderLoading => this["placeholder.loading"];
    public string ModeLocal => this["mode.local"];
    public string ModeDomain => this["mode.domain"];

    public string HomeBadge => this["home.badge"];
    public string HomeHeroTitle => this["home.hero.title"];
    public string HomeStartRuntime => this["home.actions.start_runtime"];
    public string HomeStopRuntime => this["home.actions.stop_runtime"];
    public string HomeOpenDataFolder => this["home.actions.open_data_folder"];
    public string HomeLiveStatus => this["home.live_status"];
    public string HomeCurrentState => this["home.current_state"];
    public string HomeStatusDetail => this["home.status_detail"];
    public string HomeActiveMode => this["home.labels.active_mode"];
    public string HomePort => this["home.labels.port"];
    public string HomeRoomCode => this["home.labels.room_code"];
    public string HomePublicHost => this["home.labels.public_host"];
    public string HomeDomainDev => this["home.labels.domain_dev"];
    public string HomeOpenGame => this["home.open_game"];
    public string HomeReachability => this["home.labels.reachability"];

    public string AccessBadge => this["access.badge"];
    public string AccessHeroTitle => this["access.hero.title"];
    public string AccessRoomCode => this["access.room_code"];
    public string AccessRoomCodeWatermark => this["access.room_code_watermark"];
    public string AccessCreateInvite => this["access.actions.create_control_invite"];
    public string AccessBaseEndpoints => this["access.sections.base_endpoints"];
    public string AccessOverlayView => this["access.sections.overlay_view"];
    public string AccessControlInvite => this["access.sections.control_invite"];
    public string AccessControlBody => this["access.control.body"];

    public string NetworkBadge => this["network.badge"];
    public string NetworkHeroTitle => this["network.hero.title"];
    public string NetworkMode => this["network.labels.mode"];
    public string NetworkPort => this["network.labels.port"];
    public string NetworkPublicHost => this["network.labels.public_host"];
    public string NetworkDomain => this["network.labels.domain"];
    public string NetworkDataRoot => this["network.labels.data_root"];
    public string NetworkDeveloperMode => this["network.labels.developer_mode"];
    public string NetworkLockedHint => this["network.locked_hint"];
    public string NetworkModeWatermark => this["network.mode_watermark"];
    public string NetworkSave => this["network.actions.save_settings"];

    public string DiagnosticsBadge => this["diagnostics.badge"];
    public string DiagnosticsHeroTitle => this["diagnostics.hero.title"];
    public string DiagnosticsCopyAll => this["diagnostics.actions.copy_all"];
    public string DiagnosticsClear => this["diagnostics.actions.clear"];
    public string DiagnosticsSearchPlaceholder => this["diagnostics.search_placeholder"];

    public string UpdatesBadge => this["updates.badge"];
    public string UpdatesHeroTitle => this["updates.hero.title"];
    public string UpdatesCheckNow => this["updates.actions.check_now"];
    public string UpdatesOpenReleases => this["updates.actions.open_releases"];
    public string UpdatesCurrentVersion => this["updates.labels.current_version"];
    public string UpdatesLatestRelease => this["updates.labels.latest_release"];
    public string UpdatesSelectedAsset => this["updates.labels.selected_asset"];
    public string UpdatesAvailable => this["updates.labels.available"];
    public string UpdatesActions => this["updates.actions.title"];
    public string UpdatesActionsBody => this["updates.actions.body"];
    public string UpdatesOpenSelectedAsset => this["updates.actions.open_selected_asset"];

    public string CommonOpen => this["common.open"];
    public string CommonCopy => this["common.copy"];
    public string CommonRefresh => this["common.refresh"];
    public string CommonInternal => this["common.internal"];
    public string CommonExternal => this["common.external"];

    public string SectionTitle(DesktopSection section) => section switch
    {
        DesktopSection.Home => this["nav.home.title"],
        DesktopSection.Access => this["nav.access.title"],
        DesktopSection.Network => this["nav.network.title"],
        DesktopSection.Diagnostics => this["nav.diagnostics.title"],
        DesktopSection.Updates => this["nav.updates.title"],
        _ => section.ToString(),
    };

    public string SectionSubtitle(DesktopSection section) => section switch
    {
        DesktopSection.Home => this["nav.home.subtitle"],
        DesktopSection.Access => this["nav.access.subtitle"],
        DesktopSection.Network => this["nav.network.subtitle"],
        DesktopSection.Diagnostics => this["nav.diagnostics.subtitle"],
        DesktopSection.Updates => this["nav.updates.subtitle"],
        _ => section.ToString(),
    };

    public string SectionDescription(DesktopSection section) => section switch
    {
        DesktopSection.Home => this["nav.home.description"],
        DesktopSection.Access => this["nav.access.description"],
        DesktopSection.Network => this["nav.network.description"],
        DesktopSection.Diagnostics => this["nav.diagnostics.description"],
        DesktopSection.Updates => this["nav.updates.description"],
        _ => section.ToString(),
    };
}
