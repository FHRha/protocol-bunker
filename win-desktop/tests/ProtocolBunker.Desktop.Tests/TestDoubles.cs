using ProtocolBunker.Desktop.Contracts.Models;
using ProtocolBunker.Desktop.Contracts.Services;

namespace ProtocolBunker.Desktop.Tests;

internal sealed class FakeLocalizationService : ILocalizationService
{
    private readonly Dictionary<string, Dictionary<string, string>> _texts;
    private string _currentLanguage = "ru";

    public FakeLocalizationService()
    {
        _texts = new(StringComparer.OrdinalIgnoreCase)
        {
            ["ru"] = new(StringComparer.OrdinalIgnoreCase)
            {
                ["placeholder.not_available"] = "Не задано",
                ["placeholder.loading"] = "Загрузка...",
                ["mode.local"] = "Локальная сеть",
                ["mode.domain"] = "Через домен",
                ["runtime_state.stopped"] = "Остановлен",
                ["runtime_state.starting"] = "Запускается",
                ["runtime_state.running"] = "Запущен",
                ["runtime_state.stopping"] = "Останавливается",
                ["runtime_state.error"] = "Ошибка",
                ["runtime.reachability.standard_local"] = "Обычная игра использует локальный или LAN-адрес сервера.",
                ["runtime.reachability.dev_local"] = "Режим разработки использует локальный адрес сервера.",
                ["runtime.reachability.domain_missing"] = "Домен не задан.",
                ["runtime.reachability.domain_mode"] = "Доступ через домен: https://{0}",
                ["runtime.reachability.local_external"] = "Внешний доступ через http://{0}:{1}",
                ["runtime.source.portable"] = "portable",
                ["runtime.source.repo"] = "repo",
                ["runtime.source.unresolved"] = "unresolved",
                ["runtime.unknown"] = "unknown",
                ["runtime.status.not_started"] = "Сервер не запущен.",
                ["runtime.status.unresolved"] = "Среда запуска не определена.",
                ["runtime.action.started"] = "Сервер запускается.",
                ["runtime.action.stopped"] = "Сервер остановлен.",
                ["runtime.action.not_running"] = "Сервер сейчас не запущен.",
                ["status.settings_loaded"] = "Настройки загружены.",
                ["status.settings_saved"] = "Настройки сохранены.",
                ["status.settings_saved_restarted"] = "Настройки сохранены, сервер перезапущен.",
                ["status.settings_saved_restart_needed"] = "Настройки сохранены. Перезапуск применится при следующем старте.",
                ["status.settings_saved_restart_failed"] = "Настройки сохранены, но перезапуск не удался: {0}",
                ["status.settings_invalid"] = "Настройки некорректны.",
                ["status.language_saved"] = "Язык интерфейса обновлён.",
                ["status.yes"] = "Да",
                ["status.no"] = "Нет",
                ["status.on"] = "Вкл",
                ["status.off"] = "Выкл",
                ["status.copy_failed"] = "Copy failed: {0}",
                ["status.open_failed"] = "Open failed: {0}",
                ["status.diagnostics_cleared"] = "Логи очищены.",
                ["status.nothing_to_copy"] = "Нечего копировать.",
                ["status.copied"] = "Скопировано.",
                ["status.url_unavailable"] = "Ссылка недоступна.",
                ["status.opened_in_browser"] = "Открыто в браузере.",
                ["status.folder_unavailable"] = "Папка недоступна.",
                ["status.folder_opened"] = "Папка открыта.",
                ["status.open_folder_failed"] = "Open folder failed: {0}",
                ["status.update_check_failed"] = "Update check failed: {0}",
                ["status.opened_releases"] = "Релизы открыты.",
                ["status.open_releases_failed"] = "Open releases failed: {0}",
                ["status.no_selected_asset"] = "Пакет не выбран.",
                ["status.opened_selected_asset"] = "Пакет открыт.",
                ["status.open_asset_failed"] = "Open asset failed: {0}",
                ["status.domain_required"] = "Нужен домен.",
                ["status.public_host_invalid"] = "Некорректный public host: {0}",
                ["status.domain_invalid"] = "Некорректный домен: {0}",
                ["status.localhost_only_in_dev"] = "localhost разрешён только в dev mode.",
                ["status.port_invalid"] = "Некорректный порт.",
                ["shell.badge"] = "DESKTOP CONTROL",
                ["shell.title"] = "ProtocolBunker",
                ["shell.intro"] = "intro",
                ["shell.language"] = "Язык",
                ["shell.sidebar.sections"] = "Разделы",
                ["shell.sidebar.runtime"] = "Текущий сервер",
                ["shell.sidebar.state"] = "Состояние",
                ["shell.sidebar.port_room"] = "Порт / Комната",
                ["shell.sidebar.mode_dev"] = "Режим / Dev",
                ["shell.sidebar.status"] = "Статус",
                ["shell.header.build_identity"] = "Версия сборки",
                ["shell.header.runtime_pid"] = "PID сервера",
                ["nav.home.title"] = "Главная",
                ["nav.home.subtitle"] = "Сервер",
                ["nav.home.description"] = "desc",
                ["nav.access.title"] = "Доступ",
                ["nav.access.subtitle"] = "Ссылки",
                ["nav.access.description"] = "desc",
                ["nav.network.title"] = "Сеть",
                ["nav.network.subtitle"] = "Сервер",
                ["nav.network.description"] = "desc",
                ["nav.diagnostics.title"] = "Диагностика",
                ["nav.diagnostics.subtitle"] = "Логи",
                ["nav.diagnostics.description"] = "desc",
                ["nav.updates.title"] = "Обновления",
                ["nav.updates.subtitle"] = "Релизы",
                ["nav.updates.description"] = "desc",
                ["home.badge"] = "badge",
                ["home.hero.title"] = "hero",
                ["home.actions.start_runtime"] = "Запустить сервер",
                ["home.actions.stop_runtime"] = "Остановить сервер",
                ["home.actions.open_data_folder"] = "Открыть папку данных",
                ["home.live_status"] = "Живой статус",
                ["home.current_state"] = "Текущее состояние",
                ["home.status_detail"] = "Подробности",
                ["home.labels.active_mode"] = "Активный режим",
                ["home.labels.port"] = "Порт",
                ["home.labels.room_code"] = "Код комнаты",
                ["home.labels.public_host"] = "Публичный хост",
                ["home.labels.domain_dev"] = "Домен / Dev",
                ["home.labels.reachability"] = "Доступность",
                ["home.open_game"] = "Открыть игру",
                ["access.badge"] = "badge",
                ["access.hero.title"] = "hero",
                ["access.room_code"] = "Код комнаты",
                ["access.room_code_watermark"] = "Например: ABCD",
                ["access.actions.create_control_invite"] = "Создать control invite",
                ["access.sections.base_endpoints"] = "Адреса сервера",
                ["access.sections.overlay_view"] = "Ссылки на overlay",
                ["access.sections.control_invite"] = "Control invite",
                ["access.control.body"] = "body",
                ["access.status.runtime_not_running"] = "Сервер не запущен.",
                ["access.status.room_empty"] = "Код комнаты пустой.",
                ["access.status.port_unresolved"] = "Порт не определён.",
                ["access.status.desktop_payload_invalid"] = "Некорректный ответ desktop API.",
                ["access.status.desktop_exception"] = "Не удалось обратиться к desktop API.",
                ["access.status.runtime_port_unresolved"] = "Порт сервера не определён.",
                ["access.status.room_required"] = "Нужен код комнаты.",
                ["access.status.invite_payload_invalid"] = "Некорректный invite payload.",
                ["access.status.invite_created"] = "Invite создан.",
                ["access.status.invite_exception"] = "Не удалось создать invite.",
                ["access.status.room_not_found"] = "Комната не найдена.",
                ["access.status.desktop_request_failed"] = "Desktop API error: {0}",
                ["access.status.internal_only"] = "Доступен только внутренний адрес.",
                ["access.status.internal_and_external"] = "Доступны внутренний и внешний адреса.",
                ["network.badge"] = "badge",
                ["network.hero.title"] = "hero",
                ["network.labels.mode"] = "Режим",
                ["network.labels.port"] = "Порт",
                ["network.labels.public_host"] = "Публичный хост",
                ["network.labels.domain"] = "Домен",
                ["network.labels.data_root"] = "Папка данных",
                ["network.labels.developer_mode"] = "Режим разработчика",
                ["network.locked_hint"] = "Останови сервер, чтобы изменить сетевые настройки.",
                ["network.mode_watermark"] = "local или domain",
                ["network.actions.save_settings"] = "Сохранить настройки",
                ["diagnostics.badge"] = "badge",
                ["diagnostics.hero.title"] = "hero",
                ["diagnostics.actions.copy_all"] = "Скопировать все логи",
                ["diagnostics.actions.clear"] = "Очистить лог",
                ["diagnostics.search_placeholder"] = "Поиск...",
                ["updates.badge"] = "badge",
                ["updates.hero.title"] = "hero",
                ["updates.actions.check_now"] = "Проверить",
                ["updates.actions.open_releases"] = "Открыть релизы",
                ["updates.labels.current_version"] = "Текущая версия",
                ["updates.labels.latest_release"] = "Последний релиз",
                ["updates.labels.selected_asset"] = "Выбранный пакет",
                ["updates.labels.available"] = "Обновление доступно",
                ["updates.actions.title"] = "Действия",
                ["updates.actions.body"] = "body",
                ["updates.actions.open_selected_asset"] = "Открыть пакет",
                ["common.open"] = "Открыть",
                ["common.copy"] = "Копировать",
                ["common.refresh"] = "Обновить",
                ["common.internal"] = "Внутренний",
                ["common.external"] = "Внешний",
                ["language.auto"] = "Авто",
                ["language.ru"] = "RU",
                ["language.en"] = "EN"
            },
            ["en"] = new(StringComparer.OrdinalIgnoreCase)
            {
                ["placeholder.not_available"] = "Not set",
                ["placeholder.loading"] = "Loading...",
                ["mode.local"] = "Local network",
                ["mode.domain"] = "Domain",
                ["runtime_state.stopped"] = "Stopped",
                ["runtime_state.starting"] = "Starting",
                ["runtime_state.running"] = "Started",
                ["runtime_state.stopping"] = "Stopping",
                ["runtime_state.error"] = "Error",
                ["runtime.reachability.standard_local"] = "Regular play uses the local or LAN server address.",
                ["runtime.reachability.dev_local"] = "Development mode is using the local server endpoint.",
                ["runtime.reachability.domain_missing"] = "Domain is missing.",
                ["runtime.reachability.domain_mode"] = "Domain mode via https://{0}",
                ["runtime.reachability.local_external"] = "Local mode with external host http://{0}:{1}",
                ["runtime.source.portable"] = "portable",
                ["runtime.source.repo"] = "repo",
                ["runtime.source.unresolved"] = "unresolved",
                ["runtime.unknown"] = "unknown",
                ["runtime.status.not_started"] = "Server is not running.",
                ["runtime.status.unresolved"] = "Runtime environment is unresolved.",
                ["runtime.action.started"] = "Server is starting.",
                ["runtime.action.stopped"] = "Server stopped.",
                ["runtime.action.not_running"] = "Server is not running.",
                ["status.settings_loaded"] = "Settings loaded.",
                ["status.settings_saved"] = "Settings saved.",
                ["status.settings_saved_restarted"] = "Settings saved and server restarted.",
                ["status.settings_saved_restart_needed"] = "Settings saved. Restart applies on next launch.",
                ["status.settings_saved_restart_failed"] = "Settings saved, but restart failed: {0}",
                ["status.settings_invalid"] = "Settings are invalid.",
                ["status.language_saved"] = "Interface language updated.",
                ["status.yes"] = "Yes",
                ["status.no"] = "No",
                ["status.on"] = "On",
                ["status.off"] = "Off",
                ["status.copy_failed"] = "Copy failed: {0}",
                ["status.open_failed"] = "Open failed: {0}",
                ["status.diagnostics_cleared"] = "Logs cleared.",
                ["status.nothing_to_copy"] = "Nothing to copy.",
                ["status.copied"] = "Copied.",
                ["status.url_unavailable"] = "URL unavailable.",
                ["status.opened_in_browser"] = "Opened in browser.",
                ["status.folder_unavailable"] = "Folder unavailable.",
                ["status.folder_opened"] = "Folder opened.",
                ["status.open_folder_failed"] = "Open folder failed: {0}",
                ["status.update_check_failed"] = "Update check failed: {0}",
                ["status.opened_releases"] = "Releases opened.",
                ["status.open_releases_failed"] = "Open releases failed: {0}",
                ["status.no_selected_asset"] = "No selected asset.",
                ["status.opened_selected_asset"] = "Selected asset opened.",
                ["status.open_asset_failed"] = "Open asset failed: {0}",
                ["status.domain_required"] = "Domain is required.",
                ["status.public_host_invalid"] = "Invalid public host: {0}",
                ["status.domain_invalid"] = "Invalid domain: {0}",
                ["status.localhost_only_in_dev"] = "localhost is allowed only in developer mode.",
                ["status.port_invalid"] = "Invalid port.",
                ["shell.badge"] = "DESKTOP CONTROL",
                ["shell.title"] = "ProtocolBunker",
                ["shell.intro"] = "intro",
                ["shell.language"] = "Language",
                ["shell.sidebar.sections"] = "Sections",
                ["shell.sidebar.runtime"] = "Current Server",
                ["shell.sidebar.state"] = "State",
                ["shell.sidebar.port_room"] = "Port / Room",
                ["shell.sidebar.mode_dev"] = "Mode / Dev",
                ["shell.sidebar.status"] = "Status",
                ["shell.header.build_identity"] = "Build identity",
                ["shell.header.runtime_pid"] = "Server PID",
                ["nav.home.title"] = "Home",
                ["nav.home.subtitle"] = "Server",
                ["nav.home.description"] = "desc",
                ["nav.access.title"] = "Access",
                ["nav.access.subtitle"] = "Sharing",
                ["nav.access.description"] = "desc",
                ["nav.network.title"] = "Network",
                ["nav.network.subtitle"] = "Server",
                ["nav.network.description"] = "desc",
                ["nav.diagnostics.title"] = "Diagnostics",
                ["nav.diagnostics.subtitle"] = "Logs",
                ["nav.diagnostics.description"] = "desc",
                ["nav.updates.title"] = "Updates",
                ["nav.updates.subtitle"] = "Release",
                ["nav.updates.description"] = "desc",
                ["home.badge"] = "badge",
                ["home.hero.title"] = "hero",
                ["home.actions.start_runtime"] = "Start server",
                ["home.actions.stop_runtime"] = "Stop server",
                ["home.actions.open_data_folder"] = "Open data folder",
                ["home.live_status"] = "Live status",
                ["home.current_state"] = "Current state",
                ["home.status_detail"] = "Status detail",
                ["home.labels.active_mode"] = "Active mode",
                ["home.labels.port"] = "Port",
                ["home.labels.room_code"] = "Room code",
                ["home.labels.public_host"] = "Public host",
                ["home.labels.domain_dev"] = "Domain / Dev",
                ["home.labels.reachability"] = "Reachability",
                ["home.open_game"] = "Open the game",
                ["access.badge"] = "badge",
                ["access.hero.title"] = "hero",
                ["access.room_code"] = "Room code",
                ["access.room_code_watermark"] = "For example: ABCD",
                ["access.actions.create_control_invite"] = "Create control invite",
                ["access.sections.base_endpoints"] = "Server addresses",
                ["access.sections.overlay_view"] = "Overlay links",
                ["access.sections.control_invite"] = "Control invite",
                ["access.control.body"] = "body",
                ["access.status.runtime_not_running"] = "Server is not running.",
                ["access.status.room_empty"] = "Room code is empty.",
                ["access.status.port_unresolved"] = "Server port is unresolved.",
                ["access.status.desktop_payload_invalid"] = "Desktop API returned an invalid payload.",
                ["access.status.desktop_exception"] = "Desktop API request failed.",
                ["access.status.runtime_port_unresolved"] = "Server port is unresolved.",
                ["access.status.room_required"] = "Room code is required.",
                ["access.status.invite_payload_invalid"] = "Invite payload is invalid.",
                ["access.status.invite_created"] = "Invite created.",
                ["access.status.invite_exception"] = "Failed to create invite.",
                ["access.status.room_not_found"] = "Room was not found.",
                ["access.status.desktop_request_failed"] = "Desktop API error: {0}",
                ["access.status.internal_only"] = "Only internal address is available.",
                ["access.status.internal_and_external"] = "Internal and external addresses are available.",
                ["network.badge"] = "badge",
                ["network.hero.title"] = "hero",
                ["network.labels.mode"] = "Mode",
                ["network.labels.port"] = "Port",
                ["network.labels.public_host"] = "Public host",
                ["network.labels.domain"] = "Domain",
                ["network.labels.data_root"] = "Data root",
                ["network.labels.developer_mode"] = "Developer mode",
                ["network.locked_hint"] = "Stop the server before changing network settings.",
                ["network.mode_watermark"] = "local or domain",
                ["network.actions.save_settings"] = "Save settings",
                ["diagnostics.badge"] = "badge",
                ["diagnostics.hero.title"] = "hero",
                ["diagnostics.actions.copy_all"] = "Copy all logs",
                ["diagnostics.actions.clear"] = "Clear log",
                ["diagnostics.search_placeholder"] = "Search...",
                ["updates.badge"] = "badge",
                ["updates.hero.title"] = "hero",
                ["updates.actions.check_now"] = "Check now",
                ["updates.actions.open_releases"] = "Open releases",
                ["updates.labels.current_version"] = "Current version",
                ["updates.labels.latest_release"] = "Latest release",
                ["updates.labels.selected_asset"] = "Selected asset",
                ["updates.labels.available"] = "Update available",
                ["updates.actions.title"] = "Actions",
                ["updates.actions.body"] = "body",
                ["updates.actions.open_selected_asset"] = "Open selected package",
                ["common.open"] = "Open",
                ["common.copy"] = "Copy",
                ["common.refresh"] = "Refresh",
                ["common.internal"] = "Internal",
                ["common.external"] = "External",
                ["language.auto"] = "Auto",
                ["language.ru"] = "RU",
                ["language.en"] = "EN"
            }
        };
    }

    public string CurrentLanguage => _currentLanguage;
    public IReadOnlyList<string> AvailableLanguages => ["ru", "en"];
    public event EventHandler? LanguageChanged;

    public string Get(string key)
    {
        if (_texts.TryGetValue(_currentLanguage, out var current) && current.TryGetValue(key, out var value))
        {
            return value;
        }

        return _texts["en"].TryGetValue(key, out var fallback) ? fallback : key;
    }

    public void SetLanguage(string language)
    {
        _currentLanguage = string.Equals(language, "en", StringComparison.OrdinalIgnoreCase) ? "en" : "ru";
        LanguageChanged?.Invoke(this, EventArgs.Empty);
    }
}

internal sealed class FakeDesktopSettingsService : IDesktopSettingsService
{
    public DesktopSettingsModel Current { get; set; } = new(
        Language: "ru",
        Mode: "local",
        Port: 8080,
        PublicHost: string.Empty,
        Domain: string.Empty,
        DataFolder: "app/data",
        RoomCode: "ABCD",
        DeveloperMode: false,
        HostToken: string.Empty,
        ViewToken: string.Empty,
        EditToken: string.Empty);

    public Task<DesktopSettingsModel> LoadAsync(CancellationToken cancellationToken = default) => Task.FromResult(Current);

    public Task SaveAsync(DesktopSettingsModel settings, CancellationToken cancellationToken = default)
    {
        Current = settings;
        return Task.CompletedTask;
    }
}

internal sealed class FakeRuntimeService : IRuntimeService
{
    public Func<DesktopSettingsModel?, HomeStatusSnapshot>? SnapshotFactory { get; set; }
    public HomeStatusSnapshot CurrentSnapshot { get; set; } = new(
        Version: "v0.2.8",
        RuntimeState: RuntimeState.Stopped,
        ActiveMode: "local",
        Port: 8080,
        RoomCode: "ABCD",
        ReachabilitySummary: "reachability",
        RuntimeSource: "source",
        InstallRoot: "install",
        AppRoot: "app",
        DataRoot: "app/data",
        ProcessId: null,
        StatusDetail: "detail");

    public RuntimeActionResult StartResult { get; set; } = new(true, "started");
    public RuntimeActionResult StopResult { get; set; } = new(true, "stopped");

    public event EventHandler<RuntimeOutputEventArgs>? OutputReceived;
    public event EventHandler? StateChanged;

    public Task<HomeStatusSnapshot> GetHomeStatusAsync(DesktopSettingsModel? settingsOverride = null, CancellationToken cancellationToken = default)
        => Task.FromResult(SnapshotFactory?.Invoke(settingsOverride) ?? CurrentSnapshot);

    public Task<RuntimeActionResult> StartAsync(DesktopSettingsModel? settingsOverride = null, CancellationToken cancellationToken = default)
        => Task.FromResult(StartResult);

    public Task<RuntimeActionResult> StopAsync(CancellationToken cancellationToken = default)
        => Task.FromResult(StopResult);

    public void RaiseStateChanged() => StateChanged?.Invoke(this, EventArgs.Empty);

    public void EmitOutput(string text, bool isError = false)
        => OutputReceived?.Invoke(this, new RuntimeOutputEventArgs(new RuntimeOutputEntry(DateTimeOffset.UtcNow, text, isError)));
}

internal sealed class FakeRoomLinkService : IRoomLinkService
{
    public Func<DesktopSettingsModel?, RoomLinksSnapshot>? SnapshotFactory { get; set; }
    public RoomLinksSnapshot Snapshot { get; set; } = new(
        RoomCode: "ABCD",
        InternalBaseUrl: "http://127.0.0.1:8080",
        ExternalBaseUrl: null,
        PlayerUrlInternal: null,
        PlayerUrlExternal: null,
        OverlayUrlInternal: null,
        OverlayUrlExternal: null,
        ControlInviteUrlInternal: null,
        ControlInviteUrlExternal: null,
        StatusMessage: "ok");

    public ControlInviteResult InviteResult { get; set; } = new(true, "invite", "http://127.0.0.1:8080/i", null);

    public Task<RoomLinksSnapshot> BuildAsync(DesktopSettingsModel? settingsOverride = null, CancellationToken cancellationToken = default)
        => Task.FromResult(SnapshotFactory?.Invoke(settingsOverride) ?? Snapshot);

    public Task<ControlInviteResult> CreateControlInviteAsync(DesktopSettingsModel? settingsOverride = null, CancellationToken cancellationToken = default)
        => Task.FromResult(InviteResult);
}

internal sealed class FakePlatformShellService : IPlatformShellService
{
    public Task CopyTextAsync(string text, CancellationToken cancellationToken = default) => Task.CompletedTask;
    public Task OpenUrlAsync(string url, CancellationToken cancellationToken = default) => Task.CompletedTask;
    public Task OpenFolderAsync(string path, CancellationToken cancellationToken = default) => Task.CompletedTask;
}

internal sealed class FakeUpdateService : IUpdateService
{
    public UpdateStatusSnapshot Snapshot { get; set; } = new(
        CurrentVersion: "v0.2.8",
        LatestVersion: "v0.2.8",
        SelectedAssetName: "asset",
        SelectedAssetUrl: "https://example.test/asset",
        ReleasesPageUrl: "https://example.test/releases",
        IsUpdateAvailable: false,
        StatusMessage: "ok");

    public Task<UpdateStatusSnapshot> GetStatusAsync(CancellationToken cancellationToken = default) => Task.FromResult(Snapshot);
    public Task<UpdateStatusSnapshot> CheckForUpdatesAsync(CancellationToken cancellationToken = default) => Task.FromResult(Snapshot);
    public Task OpenReleasesPageAsync(CancellationToken cancellationToken = default) => Task.CompletedTask;
    public Task OpenSelectedAssetAsync(string assetUrl, CancellationToken cancellationToken = default) => Task.CompletedTask;
}
