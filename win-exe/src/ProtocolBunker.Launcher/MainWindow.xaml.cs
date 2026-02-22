
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Imaging;
using Microsoft.Win32;
using Brush = System.Windows.Media.Brush;
using Forms = System.Windows.Forms;
using DrawingIcon = System.Drawing.Icon;
using MessageBox = System.Windows.MessageBox;
using Clipboard = System.Windows.Clipboard;

namespace ProtocolBunker.Launcher;

public partial class MainWindow : Window
{
    private const string ReleasesApi = "https://api.github.com/repos/FHRha/protocol-bunker/releases/latest";
    private const string ReleasesPage = "https://github.com/FHRha/protocol-bunker/releases/latest";
    private const int MaxLogLines = 2400;

    private static readonly Regex[] PreferredUpdateAssetPatterns =
    {
        new("^protocol-bunker-win-x64-exe(?:-v[0-9A-Za-z.-]+)?\\.zip$", RegexOptions.Compiled | RegexOptions.IgnoreCase),
    };

    private static readonly Regex PortMarkerRegex = new("__BUNKER_PORT__=(\\d{1,5})", RegexOptions.Compiled);
    private static readonly Regex UrlPortRegex = new("https?://\\S+:(\\d{2,5})", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex ListeningRegex = new("listening", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex HostnameRegex = new("^(?=.{1,253}$)(?!-)(?:[a-zA-Z0-9-]{1,63}\\.)*[a-zA-Z0-9-]{1,63}$", RegexOptions.Compiled);
    private static readonly string[] VpnAdapterNameTokens =
    {
        "nekobox", "vpn", "wintun", "wireguard", "tun", "tap", "openvpn", "clash", "warp",
        "vethernet", "hyper-v", "vmware", "virtual", "loopback", "docker", "podman", "wsl",
        "tailscale", "zerotier", "hamachi", "isatap", "teredo",
    };

    private readonly string _installDir;
    private readonly string _appDir;
    private readonly string _logsDir;
    private readonly string _portableEnvPath;
    private readonly string _launcherSettingsPath;
    private readonly string _versionPath;
    private readonly string _serverLogPath;
    private readonly string _launcherLogPath;
    private readonly string _portPath;
    private readonly string _urlsPath;
    private readonly string _updaterPath;

    private readonly HttpClient _httpClient = new() { Timeout = TimeSpan.FromSeconds(20) };
    private readonly object _serverLogLock = new();
    private readonly object _launcherLogLock = new();
    private readonly SemaphoreSlim _startStopSemaphore = new(1, 1);
    private readonly List<LogEntry> _allLogs = new();
    private readonly ObservableCollection<LogEntryView> _visibleLogs = new();

    private Process? _serverProcess;
    private StreamWriter? _serverLogWriter;
    private int _requestedPort;
    private int? _detectedPort;
    private bool _stopping;
    private bool _isStopInProgress;
    private bool _closingAfterStop;
    private bool _isResolvingExternalIp;
    private string _lanIp = "127.0.0.1";
    private string _externalIp = string.Empty;
    private string? _internalBaseUrl;
    private string? _externalBaseUrl;
    private ThemePalette _currentPalette = ThemeManager.ResolvePalette(ThemeManager.SystemThemeName);

    private string _hostToken = string.Empty;
    private string _viewToken = string.Empty;
    private string _editToken = string.Empty;
    private bool _tokensVisible;
    private bool _updatingTokenFields;
    private bool _serverStoppedLogged;
    private bool _isApplyingSettings;
    private Forms.NotifyIcon? _trayIcon;
    private bool _trayBalloonShown;

    public MainWindow()
    {
        InitializeComponent();

        _installDir = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        _appDir = Path.Combine(_installDir, "app");
        _logsDir = Path.Combine(_appDir, "logs");
        _portableEnvPath = Path.Combine(_appDir, "portable.env");
        _launcherSettingsPath = Path.Combine(_installDir, "launcher.settings.json");
        _versionPath = Path.Combine(_appDir, "VERSION");
        _serverLogPath = Path.Combine(_logsDir, "server.log");
        _launcherLogPath = Path.Combine(_logsDir, "launcher.log");
        _portPath = Path.Combine(_logsDir, "port.txt");
        _urlsPath = Path.Combine(_logsDir, "urls.txt");
        _updaterPath = Path.Combine(_installDir, "UpdaterHelper.exe");

        _httpClient.DefaultRequestHeaders.UserAgent.ParseAdd("ProtocolBunkerLauncher/1.0");
        _httpClient.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");

        Directory.CreateDirectory(_logsDir);
        Directory.CreateDirectory(Path.Combine(_appDir, "data"));

        LogListBox.ItemsSource = _visibleLogs;
        AutoScrollCheckBox.IsChecked = true;
        InitializeTrayIcon();

        TryLoadWindowIcon();
        LoadInitialSettings();
        EnsureDefaultSelections();

        ApplyThemeFromUi();
        UpdateModeUi();
        UpdatePortValidation();
        UpdatePublicHostValidation();
        UpdateDevModeUi();
        UpdateVersionLabels();
        UpdateStatus();
        UpdateLinksAndFiles();

        AppendLine($"Лаунчер готов. Версия: {ReadCurrentVersion()}");
        AppendLine($"Сборка лаунчера: {ReadLauncherBuildStamp()}");

        Closing += OnWindowClosing;
        Closed += OnWindowClosed;
        StateChanged += OnWindowStateChanged;
        RunBackgroundTask(ResolveExternalIpIfNeededAsync(force: false), "Ошибка определения внешнего IP");
        RunBackgroundTask(CheckUpdatesAsync(interactive: false), "Ошибка фоновой проверки обновлений");
    }

    private bool IsServerRunning => _serverProcess is { HasExited: false };

    private void RunBackgroundTask(Task task, string context)
    {
        task.ContinueWith(
            t =>
            {
                if (t.Exception is null) return;
                var message = t.Exception.GetBaseException().Message;
                Dispatcher.BeginInvoke(new Action(() => AppendLine($"{context}: {message}", LogLevel.Warn)));
            },
            CancellationToken.None,
            TaskContinuationOptions.OnlyOnFaulted,
            TaskScheduler.Default);
    }

    private void EnsureDefaultSelections()
    {
        if (ThemeComboBox.SelectedItem is null) SetComboSelectionByTag(ThemeComboBox, ThemeManager.SystemThemeName);
        if (ModeComboBox.SelectedItem is null) SetComboSelectionByTag(ModeComboBox, "local");
        if (OpenTargetComboBox.SelectedItem is null) SetComboSelectionByTag(OpenTargetComboBox, "internal");
    }

    private void LoadInitialSettings()
    {
        var launcherSettings = LauncherSettings.LoadOrDefault(_launcherSettingsPath);
        var hasLauncherSettings = File.Exists(_launcherSettingsPath);
        var portable = ReadPortableEnv(_portableEnvPath);
        ApplySettings(hasLauncherSettings ? launcherSettings : BuildSettingsFromPortable(portable));
    }

    private static Dictionary<string, string> ReadPortableEnv(string path)
    {
        var dict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (!File.Exists(path)) return dict;

        foreach (var rawLine in File.ReadAllLines(path))
        {
            var line = rawLine.Trim();
            if (line.Length == 0 || line.StartsWith("#") || line.StartsWith(";")) continue;

            var separator = line.IndexOf('=');
            if (separator <= 0) continue;

            var key = line[..separator].Trim().ToUpperInvariant();
            var value = line[(separator + 1)..].Trim();
            dict[key] = value;
        }

        return dict;
    }

    private static LauncherSettings BuildSettingsFromPortable(Dictionary<string, string> portable)
    {
        var mode = NormalizeMode(portable.GetValueOrDefault("MODE", "local"));
        var port = 8080;
        if (int.TryParse(portable.GetValueOrDefault("PORT", "8080"), out var parsed) && parsed is > 0 and <= 65535)
        {
            port = parsed;
        }

        return new LauncherSettings
        {
            Mode = mode,
            Port = port,
            Domain = portable.GetValueOrDefault("DOMAIN", string.Empty),
            PublicHost = portable.GetValueOrDefault("PUBLIC_HOST", string.Empty),
            DataFolder = portable.GetValueOrDefault("DATA_DIR", @"app\data"),
            RoomCode = portable.GetValueOrDefault("ROOM_CODE", string.Empty),
            HostToken = portable.GetValueOrDefault("HOST_TOKEN", string.Empty),
            ViewToken = portable.GetValueOrDefault("VIEW_TOKEN", string.Empty),
            EditToken = portable.GetValueOrDefault("EDIT_TOKEN", string.Empty),
            DevMode = ToBool(portable.GetValueOrDefault("DEV_MODE", "0")),
            Theme = ThemeManager.SystemThemeName,
            AutoScrollLogs = true,
            OpenTarget = "internal",
            MinimizeToTray = true,
        };
    }

    private void ApplySettings(LauncherSettings settings)
    {
        _isApplyingSettings = true;
        try
        {
            SetComboSelectionByTag(ModeComboBox, NormalizeMode(settings.Mode));
            SetComboSelectionByTag(ThemeComboBox, NormalizeThemeName(settings.Theme));
            SetComboSelectionByTag(OpenTargetComboBox, NormalizeOpenTarget(settings.OpenTarget));

            PortTextBox.Text = settings.Port.ToString(CultureInfo.InvariantCulture);
            PublicHostTextBox.Text = settings.PublicHost ?? string.Empty;
            DomainTextBox.Text = settings.Domain ?? string.Empty;
            DataFolderTextBox.Text = string.IsNullOrWhiteSpace(settings.DataFolder) ? @"app\data" : settings.DataFolder;
            RoomCodeTextBox.Text = settings.RoomCode ?? string.Empty;
            DevModeCheckBox.IsChecked = settings.DevMode;
            AutoScrollCheckBox.IsChecked = settings.AutoScrollLogs;
            MinimizeToTrayCheckBox.IsChecked = settings.MinimizeToTray;

            _hostToken = settings.HostToken ?? string.Empty;
            _viewToken = settings.ViewToken ?? string.Empty;
            _editToken = settings.EditToken ?? string.Empty;

            _tokensVisible = false;
            RefreshTokenFields();
        }
        finally
        {
            _isApplyingSettings = false;
        }

        UpdateDevModeUi();
    }

    private static void SetComboSelectionByTag(System.Windows.Controls.ComboBox comboBox, string tagValue)
    {
        for (var i = 0; i < comboBox.Items.Count; i++)
        {
            if (comboBox.Items[i] is ComboBoxItem item && string.Equals(item.Tag?.ToString(), tagValue, StringComparison.OrdinalIgnoreCase))
            {
                comboBox.SelectedIndex = i;
                return;
            }
        }

        comboBox.SelectedIndex = comboBox.Items.Count > 0 ? 0 : -1;
    }

    private static string GetComboSelectedTag(System.Windows.Controls.ComboBox comboBox) =>
        (comboBox.SelectedItem as ComboBoxItem)?.Tag?.ToString() ?? string.Empty;

    private static bool ToBool(string? value)
    {
        var normalized = (value ?? string.Empty).Trim().ToLowerInvariant();
        return normalized is "1" or "true" or "yes" or "on";
    }

    private static string NormalizeMode(string? mode)
    {
        var normalized = (mode ?? string.Empty).Trim().ToLowerInvariant();
        return normalized == "domain" ? "domain" : "local";
    }

    private static string NormalizeThemeName(string? theme)
    {
        var value = (theme ?? string.Empty).Trim();
        if (value.Equals(ThemeManager.LightThemeName, StringComparison.OrdinalIgnoreCase)) return ThemeManager.LightThemeName;
        if (value.Equals(ThemeManager.DarkThemeName, StringComparison.OrdinalIgnoreCase)) return ThemeManager.DarkThemeName;
        return ThemeManager.SystemThemeName;
    }

    private static string NormalizeOpenTarget(string? target)
    {
        var normalized = (target ?? string.Empty).Trim().ToLowerInvariant();
        return normalized == "external" ? "external" : "internal";
    }

    private LauncherSettings BuildLauncherSettingsFromUi() => new()
    {
        Mode = NormalizeMode(GetComboSelectedTag(ModeComboBox)),
        Port = ParsePortOrDefault(),
        PublicHost = PublicHostTextBox.Text.Trim(),
        Domain = DomainTextBox.Text.Trim(),
        DataFolder = DataFolderTextBox.Text.Trim(),
        RoomCode = RoomCodeTextBox.Text.Trim(),
        HostToken = _hostToken,
        ViewToken = _viewToken,
        EditToken = _editToken,
        DevMode = DevModeCheckBox.IsChecked == true,
        Theme = NormalizeThemeName(GetComboSelectedTag(ThemeComboBox)),
        AutoScrollLogs = AutoScrollCheckBox.IsChecked == true,
        OpenTarget = NormalizeOpenTarget(GetComboSelectedTag(OpenTargetComboBox)),
        MinimizeToTray = MinimizeToTrayCheckBox.IsChecked == true,
    };
    private static string MaskToken(string token) => token.Length == 0 ? string.Empty : new string('*', Math.Min(token.Length, 24));

    private void RefreshTokenFields()
    {
        _updatingTokenFields = true;
        try
        {
            if (_tokensVisible)
            {
                HostTokenTextBox.Text = _hostToken;
                ViewTokenTextBox.Text = _viewToken;
                EditTokenTextBox.Text = _editToken;
                HostTokenTextBox.IsReadOnly = false;
                ViewTokenTextBox.IsReadOnly = false;
                EditTokenTextBox.IsReadOnly = false;
                ToggleTokensButton.Content = "Скрыть токены";
            }
            else
            {
                HostTokenTextBox.Text = MaskToken(_hostToken);
                ViewTokenTextBox.Text = MaskToken(_viewToken);
                EditTokenTextBox.Text = MaskToken(_editToken);
                HostTokenTextBox.IsReadOnly = true;
                ViewTokenTextBox.IsReadOnly = true;
                EditTokenTextBox.IsReadOnly = true;
                ToggleTokensButton.Content = "Показать токены";
            }
        }
        finally
        {
            _updatingTokenFields = false;
        }
    }

    private void HostTokenTextBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        if (_tokensVisible && !_updatingTokenFields) _hostToken = HostTokenTextBox.Text;
    }

    private void ViewTokenTextBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        if (_tokensVisible && !_updatingTokenFields) _viewToken = ViewTokenTextBox.Text;
    }

    private void EditTokenTextBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        if (_tokensVisible && !_updatingTokenFields) _editToken = EditTokenTextBox.Text;
    }

    private void ToggleTokensButton_Click(object sender, RoutedEventArgs e)
    {
        _tokensVisible = !_tokensVisible;
        RefreshTokenFields();
    }

    private void GenerateTokensButton_Click(object sender, RoutedEventArgs e)
    {
        _hostToken = GenerateToken();
        _viewToken = GenerateToken();
        _editToken = GenerateToken();
        _tokensVisible = true;
        RefreshTokenFields();
        AppendLine("Токены сгенерированы.");
    }

    private static string GenerateToken()
    {
        Span<byte> bytes = stackalloc byte[24];
        RandomNumberGenerator.Fill(bytes);
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    private void CopyHostTokenButton_Click(object sender, RoutedEventArgs e) => CopyToClipboard(_hostToken);
    private void CopyViewTokenButton_Click(object sender, RoutedEventArgs e) => CopyToClipboard(_viewToken);
    private void CopyEditTokenButton_Click(object sender, RoutedEventArgs e) => CopyToClipboard(_editToken);

    private static void CopyToClipboard(string value)
    {
        if (!string.IsNullOrWhiteSpace(value)) Clipboard.SetText(value);
    }

    private static bool IsPortValid(string value, out int port)
    {
        if (!int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out port)) return false;
        return port is >= 1 and <= 65535;
    }

    private int ParsePortOrDefault() => IsPortValid(PortTextBox.Text.Trim(), out var port) ? port : 8080;

    private bool UpdatePortValidation()
    {
        var isValid = IsPortValid(PortTextBox.Text.Trim(), out _);
        PortValidationTextBlock.Visibility = isValid ? Visibility.Collapsed : Visibility.Visible;
        PortTextBox.BorderBrush = isValid
            ? (Brush)Resources["Launcher.InputBorderBrush"]
            : new SolidColorBrush(ThemeManager.ColorFromHex("CF3A3A"));
        return isValid;
    }

    private bool UpdatePublicHostValidation()
    {
        var raw = PublicHostTextBox.Text.Trim();
        if (raw.Length == 0)
        {
            PublicHostValidationTextBlock.Visibility = Visibility.Collapsed;
            PublicHostTextBox.BorderBrush = (Brush)Resources["Launcher.InputBorderBrush"];
            return true;
        }

        var normalized = NormalizeHost(raw);
        var isValid = normalized.Length > 0 && IsValidHostOrIp(normalized);

        PublicHostValidationTextBlock.Visibility = isValid ? Visibility.Collapsed : Visibility.Visible;
        PublicHostTextBox.BorderBrush = isValid
            ? (Brush)Resources["Launcher.InputBorderBrush"]
            : new SolidColorBrush(ThemeManager.ColorFromHex("CF3A3A"));

        return isValid;
    }

    private static bool IsValidHostOrIp(string value)
    {
        if (IPAddress.TryParse(value, out var ip))
        {
            return ip.AddressFamily == AddressFamily.InterNetwork;
        }

        return HostnameRegex.IsMatch(value);
    }

    private void PortTextBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        UpdatePortValidation();
        UpdateLinksAndFiles();
    }

    private void PublicHostTextBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        UpdatePublicHostValidation();
        _externalIp = string.Empty;
        RunBackgroundTask(ResolveExternalIpIfNeededAsync(force: false), "Ошибка определения внешнего IP");
        UpdateLinksAndFiles();
    }

    private void DomainTextBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        UpdateModeUi();
        UpdateLinksAndFiles();
    }

    private void DevModeCheckBox_Changed(object sender, RoutedEventArgs e)
    {
        UpdateDevModeUi();
        UpdateLinksAndFiles();
        if (!_isApplyingSettings)
        {
            SaveLauncherSettings();
        }
    }

    private void ModeComboBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        UpdateModeUi();
        UpdateLinksAndFiles();
    }

    private void UpdateModeUi()
    {
        var mode = NormalizeMode(GetComboSelectedTag(ModeComboBox));
        DomainTextBox.IsEnabled = mode == "domain";
    }

    private void ThemeComboBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        ApplyThemeFromUi();
    }

    private void OpenTargetComboBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        UpdateLinksAndFiles();
    }

    private void MinimizeToTrayCheckBox_Changed(object sender, RoutedEventArgs e)
    {
        SaveLauncherSettings();
    }

    private void ApplyThemeFromUi()
    {
        _currentPalette = ThemeManager.ApplyTheme(this, NormalizeThemeName(GetComboSelectedTag(ThemeComboBox)));
        UpdatePortValidation();
        UpdatePublicHostValidation();
        RefreshLogView();
    }

    private void UpdateVersionLabels()
    {
        var version = ReadCurrentVersion();
        HeaderVersionTextBlock.Text = version;
        VersionValueTextBlock.Text = version;
    }

    private string ReadCurrentVersion()
    {
        if (!File.Exists(_versionPath)) return "unknown";
        var text = File.ReadAllText(_versionPath, Encoding.UTF8).Trim();
        return string.IsNullOrWhiteSpace(text) ? "unknown" : text;
    }

    private string ReadLauncherBuildStamp()
    {
        try
        {
            var launcherPath = Path.Combine(_installDir, "ProtocolBunker.exe");
            var filePath = File.Exists(launcherPath) ? launcherPath : Environment.ProcessPath;
            if (string.IsNullOrWhiteSpace(filePath) || !File.Exists(filePath))
            {
                return "unknown";
            }

            var stamp = File.GetLastWriteTime(filePath);
            return stamp.ToString("yyyy-MM-dd HH:mm:ss");
        }
        catch
        {
            return "unknown";
        }
    }

    private void SaveLauncherSettings()
    {
        BuildLauncherSettingsFromUi().Save(_launcherSettingsPath);
    }

    private void SavePortableEnv(LaunchSettings settings)
    {
        var lines = new[]
        {
            $"PORT={settings.Port}",
            $"DEV_MODE={(settings.DevMode ? "1" : "0")}",
            $"MODE={settings.Mode}",
            "# MODE=domain",
            "# DOMAIN=bunker.example.com",
            $"DOMAIN={settings.Domain}",
            $"PUBLIC_HOST={settings.PublicHost}",
            $"DATA_DIR={settings.DataFolderRaw}",
            $"HOST_TOKEN={settings.HostToken}",
            $"VIEW_TOKEN={settings.ViewToken}",
            $"EDIT_TOKEN={settings.EditToken}",
            $"ROOM_CODE={settings.RoomCode}",
        };

        var directory = Path.GetDirectoryName(_portableEnvPath);
        if (!string.IsNullOrWhiteSpace(directory)) Directory.CreateDirectory(directory);
        File.WriteAllLines(_portableEnvPath, lines, Encoding.UTF8);
    }

    private LaunchSettings ReadLaunchSettings()
    {
        if (!UpdatePortValidation()) throw new InvalidOperationException("Порт должен быть в диапазоне 1..65535.");
        if (!UpdatePublicHostValidation()) throw new InvalidOperationException("Укажите корректный внешний адрес.");

        var mode = NormalizeMode(GetComboSelectedTag(ModeComboBox));
        var domain = NormalizeHost(DomainTextBox.Text);
        if (mode == "domain")
        {
            if (domain.Length == 0) throw new InvalidOperationException("Для режима Домен заполните поле Домен.");
            if (!IsValidHostOrIp(domain)) throw new InvalidOperationException("Поле Домен заполнено некорректно.");
        }

        var dataRaw = DataFolderTextBox.Text.Trim();
        if (dataRaw.Length == 0)
        {
            dataRaw = @"app\data";
            DataFolderTextBox.Text = dataRaw;
        }

        var port = int.Parse(PortTextBox.Text.Trim(), CultureInfo.InvariantCulture);
        var dataPath = ResolvePath(dataRaw);

        return new LaunchSettings(
            port,
            mode,
            domain,
            NormalizeHost(PublicHostTextBox.Text),
            dataRaw,
            dataPath,
            DevModeCheckBox.IsChecked == true,
            RoomCodeTextBox.Text.Trim(),
            _hostToken,
            _viewToken,
            _editToken);
    }

    private string ResolvePath(string pathValue)
    {
        if (Path.IsPathRooted(pathValue)) return Path.GetFullPath(pathValue);
        return Path.GetFullPath(Path.Combine(_installDir, pathValue.Replace('/', Path.DirectorySeparatorChar)));
    }

    private void EnsureRuntime()
    {
        var required = new[]
        {
            Path.Combine(_appDir, "node", "node.exe"),
            Path.Combine(_appDir, "server", "dist", "index.js"),
            Path.Combine(_appDir, "client", "dist", "index.html"),
            Path.Combine(_appDir, "assets"),
        };

        foreach (var item in required)
        {
            if (!File.Exists(item) && !Directory.Exists(item))
            {
                throw new FileNotFoundException($"Не найден runtime-файл: {item}");
            }
        }
    }

    private static bool IsPortBusy(int port)
    {
        try
        {
            using var client = new TcpClient();
            var result = client.BeginConnect("127.0.0.1", port, null, null);
            using var wait = result.AsyncWaitHandle;
            if (!wait.WaitOne(TimeSpan.FromMilliseconds(500)))
            {
                return false;
            }

            client.EndConnect(result);
            return client.Connected;
        }
        catch
        {
            return false;
        }
    }
    private async void StartButton_Click(object sender, RoutedEventArgs e)
    {
        await StartServerAsync();
    }

    private async Task StartServerAsync()
    {
        try
        {
            await _startStopSemaphore.WaitAsync();
            if (IsServerRunning || _isStopInProgress) return;

            var settings = ReadLaunchSettings();
            EnsureRuntime();
            if (settings.DevMode)
            {
                var confirmDev = MessageBox.Show(
                    "Вы запускаете сервер в режиме разработчика (DEV_MODE=1).\n\nПродолжить запуск в dev-режиме?",
                    "Подтверждение dev-режима",
                    MessageBoxButton.YesNo,
                    MessageBoxImage.Warning);
                if (confirmDev != MessageBoxResult.Yes)
                {
                    settings = settings with { DevMode = false };
                    DevModeCheckBox.IsChecked = false;
                    SaveLauncherSettings();
                }
            }

            if (IsPortBusy(settings.Port))
            {
                throw new InvalidOperationException($"Порт {settings.Port} уже занят. Выберите другой порт.");
            }

            Directory.CreateDirectory(settings.DataFolderPath);
            SavePortableEnv(settings);
            SaveLauncherSettings();
            ResetRunLogs();

            _requestedPort = settings.Port;
            _detectedPort = null;
            _stopping = false;
            _serverStoppedLogged = false;
            _lanIp = SelectLanIp();

            _serverLogWriter = new StreamWriter(new FileStream(_serverLogPath, FileMode.Append, FileAccess.Write, FileShare.ReadWrite))
            {
                AutoFlush = true,
            };

            var start = new ProcessStartInfo
            {
                FileName = Path.Combine(_appDir, "node", "node.exe"),
                Arguments = $"\"{Path.Combine(_appDir, "server", "dist", "index.js")}\"",
                WorkingDirectory = Path.Combine(_appDir, "server"),
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                RedirectStandardInput = true,
                CreateNoWindow = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8,
            };

            start.Environment["PORT"] = settings.Port.ToString(CultureInfo.InvariantCulture);
            start.Environment["BUNKER_SERVE_CLIENT"] = "true";
            start.Environment["BUNKER_PORTABLE"] = "1";
            start.Environment["BUNKER_ASSETS_ROOT"] = Path.Combine(_appDir, "assets");
            start.Environment["BUNKER_CLIENT_DIST"] = Path.Combine(_appDir, "client", "dist");
            start.Environment["BUNKER_DATA_DIR"] = settings.DataFolderPath;

            if (settings.Mode == "domain")
            {
                start.Environment["HOST"] = "127.0.0.1";
                start.Environment["TRUST_PROXY"] = "true";
                start.Environment["PUBLIC_ORIGIN"] = $"https://{settings.Domain}";
            }
            else
            {
                start.Environment["HOST"] = "0.0.0.0";
                start.Environment["TRUST_PROXY"] = "false";
                if (settings.PublicHost.Length > 0)
                {
                    start.Environment["PUBLIC_ORIGIN"] = $"http://{settings.PublicHost}:{settings.Port}";
                }
                else
                {
                    start.Environment.Remove("PUBLIC_ORIGIN");
                }
            }

            ApplyDevMode(start, settings.DevMode);

            var process = new Process
            {
                StartInfo = start,
                EnableRaisingEvents = true,
            };

            process.OutputDataReceived += (_, args) => OnServerData(args.Data, false);
            process.ErrorDataReceived += (_, args) => OnServerData(args.Data, true);
            process.Exited += (_, _) => Dispatcher.BeginInvoke(new Action(() => OnServerExit(process)));

            if (!process.Start())
            {
                throw new InvalidOperationException("Не удалось запустить серверный процесс.");
            }

            _serverProcess = process;
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();

            SetDetectedPort(settings.Port);
            RunBackgroundTask(ResolveExternalIpIfNeededAsync(force: true), "Ошибка определения внешнего IP");

            AppendLine(settings.DevMode ? "Режим запуска: разработчика (DEV_MODE=1)." : "Режим запуска: обычный (DEV_MODE=0).");
            AppendLine("Сервер запущен.", LogLevel.Info);
            UpdateStatus();
        }
        catch (Exception ex)
        {
            AppendLine(ex.Message, LogLevel.Error);
            MessageBox.Show(ex.Message, "Запуск сервера", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            _startStopSemaphore.Release();
            UpdateStatus();
        }
    }

    private static void ApplyDevMode(ProcessStartInfo start, bool devMode)
    {
        start.Environment["BUNKER_ENABLE_DEV_SCENARIOS"] = devMode ? "true" : "false";
        start.Environment["BUNKER_IDENTITY_MODE"] = devMode ? "dev_tab" : "prod";
        start.Environment["BUNKER_DEV_LOGS"] = devMode ? "true" : "false";
        start.Environment["VITE_IDENTITY_MODE"] = devMode ? "dev_tab" : "prod";
        start.Environment["DEV_NEW_PLAYER_PER_TAB"] = devMode ? "true" : "false";
        start.Environment["VITE_DEV_TAB_IDENTITY"] = devMode ? "true" : "false";
        start.Environment["VITE_DEV_NEW_PLAYER_PER_TAB"] = devMode ? "true" : "false";
    }

    private void UpdateDevModeUi()
    {
        var enabled = DevModeCheckBox.IsChecked == true;
        DevModeStatusTextBlock.Text = enabled ? "Состояние: включен" : "Состояние: выключен";
        DevModeStatusTextBlock.Foreground = enabled
            ? new SolidColorBrush(ThemeManager.ColorFromHex("B91C1C"))
            : (Brush)Resources["Launcher.MutedTextBrush"];
    }

    private async void StopButton_Click(object sender, RoutedEventArgs e)
    {
        await StopServerAsync(userRequested: true);
    }

    private async Task StopServerAsync(bool userRequested)
    {
        try
        {
            await _startStopSemaphore.WaitAsync();

            if (!IsServerRunning || _serverProcess is null || _isStopInProgress)
            {
                if (userRequested)
                {
                    AppendLine("Сервер уже остановлен.", LogLevel.Info);
                }
                return;
            }

            _isStopInProgress = true;
            _stopping = true;
            UpdateStatus();

            if (userRequested)
            {
                AppendLine("Остановка сервера...", LogLevel.Info);
            }

            var process = _serverProcess;
            await RequestProcessStopAsync(process);

            if (process.HasExited)
            {
                LogServerStoppedOnce();
            }

            if (ReferenceEquals(_serverProcess, process))
            {
                CleanupProcessResources(process);
            }

            _detectedPort = null;
            UpdateLinksAndFiles();
        }
        catch (Exception ex)
        {
            AppendLine($"Ошибка остановки: {ex.Message}", LogLevel.Error);
        }
        finally
        {
            _isStopInProgress = false;
            _stopping = false;
            _startStopSemaphore.Release();
            UpdateStatus();
        }
    }

    private async Task RequestProcessStopAsync(Process process)
    {
        if (process.HasExited) return;

        try
        {
            process.StandardInput.WriteLine("exit");
            process.StandardInput.Flush();
            process.StandardInput.Close();
        }
        catch
        {
            // ignored
        }

        try
        {
            process.CloseMainWindow();
        }
        catch
        {
            // ignored
        }

        if (await WaitForExitWithTimeoutAsync(process, 2500))
        {
            return;
        }

        try
        {
            process.Kill(entireProcessTree: true);
        }
        catch
        {
            // ignored
        }

        await WaitForExitWithTimeoutAsync(process, 2500);
    }

    private static async Task<bool> WaitForExitWithTimeoutAsync(Process process, int timeoutMs)
    {
        if (process.HasExited) return true;

        using var cts = new CancellationTokenSource(timeoutMs);
        try
        {
            await process.WaitForExitAsync(cts.Token);
            return true;
        }
        catch (OperationCanceledException)
        {
            return process.HasExited;
        }
        catch
        {
            return process.HasExited;
        }
    }

    private void OnServerExit(Process process)
    {
        if (!ReferenceEquals(_serverProcess, process))
        {
            return;
        }

        var exitCode = process.HasExited ? process.ExitCode : 0;
        var stoppedByUser = _stopping;

        CleanupProcessResources(process);
        _detectedPort = null;
        UpdateLinksAndFiles();

        if (!stoppedByUser)
        {
            AppendLine($"Сервер завершен с кодом {exitCode}.", exitCode == 0 ? LogLevel.Info : LogLevel.Error);
        }
        else
        {
            LogServerStoppedOnce();
        }

        UpdateStatus();
    }

    private void LogServerStoppedOnce()
    {
        if (_serverStoppedLogged) return;
        _serverStoppedLogged = true;
        AppendLine("Сервер остановлен.", LogLevel.Info);
    }

    private void CleanupProcessResources(Process process)
    {
        try
        {
            process.CancelOutputRead();
        }
        catch
        {
            // ignored
        }

        try
        {
            process.CancelErrorRead();
        }
        catch
        {
            // ignored
        }

        try
        {
            process.Dispose();
        }
        catch
        {
            // ignored
        }

        _serverProcess = null;

        try
        {
            _serverLogWriter?.Dispose();
        }
        catch
        {
            // ignored
        }

        _serverLogWriter = null;
    }
    private void ResetRunLogs()
    {
        Directory.CreateDirectory(_logsDir);
        File.WriteAllText(_serverLogPath, string.Empty, Encoding.UTF8);
        File.WriteAllText(_portPath, string.Empty, Encoding.ASCII);
        File.WriteAllText(_urlsPath, string.Empty, Encoding.UTF8);
    }

    private void OnServerData(string? line, bool isError)
    {
        if (line is null) return;
        Dispatcher.BeginInvoke(new Action(() => HandleServerLine(line, isError)));
    }

    private void HandleServerLine(string line, bool isError)
    {
        lock (_serverLogLock)
        {
            _serverLogWriter?.WriteLine(line);
        }

        AppendLine(line, DetectLevel(line, isError));

        if (PortMarkerRegex.Match(line) is { Success: true } marker && int.TryParse(marker.Groups[1].Value, out var markerPort))
        {
            SetDetectedPort(markerPort);
            return;
        }

        if (_detectedPort is null)
        {
            if (_requestedPort > 0 && ListeningRegex.IsMatch(line))
            {
                SetDetectedPort(_requestedPort);
                return;
            }

            if (UrlPortRegex.Match(line) is { Success: true } urlMatch && int.TryParse(urlMatch.Groups[1].Value, out var urlPort))
            {
                SetDetectedPort(urlPort);
            }
        }
    }

    private static LogLevel DetectLevel(string line, bool isError)
    {
        if (isError) return LogLevel.Error;

        var lower = line.ToLowerInvariant();
        if (lower.Contains("error") || lower.Contains("exception")) return LogLevel.Error;
        if (lower.Contains("warn")) return LogLevel.Warn;
        return LogLevel.Info;
    }

    private void SetDetectedPort(int port)
    {
        if (port is < 1 or > 65535) return;

        var changed = _detectedPort != port;
        _detectedPort = port;
        File.WriteAllText(_portPath, port.ToString(CultureInfo.InvariantCulture), Encoding.ASCII);

        UpdateLinksAndFiles();

        if (changed)
        {
            AppendLine($"Определен фактический порт: {port}");
        }
    }

    private async Task ResolveExternalIpIfNeededAsync(bool force)
    {
        if (_isResolvingExternalIp) return;

        var domain = NormalizeHost(DomainTextBox.Text);
        var publicHost = NormalizeHost(PublicHostTextBox.Text);
        if (!force && (domain.Length > 0 || publicHost.Length > 0 || !string.IsNullOrWhiteSpace(_externalIp))) return;

        _isResolvingExternalIp = true;
        try
        {
            var ip = await TryResolvePublicIpAsync();
            if (!string.IsNullOrWhiteSpace(ip) && ip != _externalIp)
            {
                _externalIp = ip;
                if (!Dispatcher.HasShutdownStarted)
                {
                    await Dispatcher.InvokeAsync(UpdateLinksAndFiles);
                }
            }
        }
        catch (OperationCanceledException)
        {
            // ignored
        }
        catch (SocketException)
        {
            // ignored, external provider may fail transiently
        }
        finally
        {
            _isResolvingExternalIp = false;
        }
    }

    private async Task<string?> TryResolvePublicIpAsync()
    {
        var providers = new[] { "https://api.ipify.org", "https://ifconfig.me/ip" };
        foreach (var provider in providers)
        {
            try
            {
                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
                var value = (await _httpClient.GetStringAsync(provider, cts.Token)).Trim();
                if (IPAddress.TryParse(value, out var address) && address.AddressFamily == AddressFamily.InterNetwork)
                {
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

    private void UpdateLinksAndFiles()
    {
        var port = _detectedPort ?? ParsePortOrDefault();
        if (port is < 1 or > 65535)
        {
            _internalBaseUrl = null;
            _externalBaseUrl = null;
            SetHyperlinkText(InternalUrlHyperlink, "-");
            SetHyperlinkText(ExternalUrlHyperlink, "-");
            ExternalHintTextBlock.Text = "Введите корректный порт для формирования ссылок.";
            ExternalHintTextBlock.Visibility = Visibility.Visible;
            return;
        }

        _internalBaseUrl = BuildInternalUrl(port);
        var externalResult = BuildExternalUrl(port);
        _externalBaseUrl = externalResult.Url;

        SetHyperlinkText(InternalUrlHyperlink, _internalBaseUrl ?? "Недоступно");
        SetHyperlinkText(ExternalUrlHyperlink, _externalBaseUrl ?? "Недоступно");

        if (string.IsNullOrWhiteSpace(_externalBaseUrl))
        {
            ExternalHintTextBlock.Text = externalResult.Hint;
            ExternalHintTextBlock.Visibility = Visibility.Visible;
        }
        else
        {
            ExternalHintTextBlock.Text = externalResult.Hint;
            ExternalHintTextBlock.Visibility = Visibility.Collapsed;
        }

        WriteUrlsFile(port);
        AnimateCard(LinksCard);
    }

    private void WriteUrlsFile(int port)
    {
        var lines = new List<string>
        {
            $"Внутренняя (LAN): {_internalBaseUrl ?? "недоступна"}",
            $"Внешняя: {_externalBaseUrl ?? "недоступна"}",
        };

        if (NormalizeMode(GetComboSelectedTag(ModeComboBox)) == "domain")
        {
            lines.Add($"Upstream: http://127.0.0.1:{port}");
        }
        else if (DevModeCheckBox.IsChecked == true)
        {
            lines.Add($"Localhost: http://127.0.0.1:{port}");
        }

        File.WriteAllLines(_urlsPath, lines, Encoding.UTF8);
    }

    private static void SetHyperlinkText(System.Windows.Documents.Hyperlink link, string text)
    {
        link.Inlines.Clear();
        link.Inlines.Add(text);
    }

    private string? BuildInternalUrl(int port)
    {
        if (DevModeCheckBox.IsChecked == true)
        {
            return $"http://localhost:{port}";
        }

        var lan = _lanIp;
        if (string.IsNullOrWhiteSpace(lan) || lan == "127.0.0.1")
        {
            lan = SelectLanIp();
            _lanIp = lan;
        }

        if (string.IsNullOrWhiteSpace(lan) || lan == "127.0.0.1") return null;
        return $"http://{lan}:{port}";
    }

    private (string? Url, string Hint) BuildExternalUrl(int port)
    {
        var mode = NormalizeMode(GetComboSelectedTag(ModeComboBox));
        var domain = NormalizeHost(DomainTextBox.Text);
        if (domain.Length > 0)
        {
            if (IsLocalHostValue(domain) && DevModeCheckBox.IsChecked != true)
            {
                return (null, "Внешняя ссылка недоступна: localhost разрешен только в режиме разработчика.");
            }

            if (mode == "domain")
            {
                return ($"https://{domain}", "Используется домен в режиме reverse proxy.");
            }

            return ($"http://{domain}:{port}", "Используется домен.");
        }

        var publicHost = NormalizeHost(PublicHostTextBox.Text);
        if (publicHost.Length > 0)
        {
            if (IsLocalHostValue(publicHost) && DevModeCheckBox.IsChecked != true)
            {
                return (null, "Внешняя ссылка недоступна: localhost разрешен только в режиме разработчика.");
            }

            return ($"http://{publicHost}:{port}", "Используется внешний адрес из поля настроек.");
        }

        if (!string.IsNullOrWhiteSpace(_externalIp))
        {
            return ($"http://{_externalIp}:{port}", "Внешний IP определен автоматически.");
        }

        RunBackgroundTask(ResolveExternalIpIfNeededAsync(force: false), "Ошибка определения внешнего IP");
        return (null, "Внешняя ссылка недоступна: укажите Внешний адрес или Домен.");
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
        var v = value.Trim().ToLowerInvariant();
        return v is "localhost" or "127.0.0.1" or "0.0.0.0";
    }

    private static bool IsVpnAdapterActive()
    {
        foreach (var adapter in NetworkInterface.GetAllNetworkInterfaces())
        {
            if (adapter.OperationalStatus != OperationalStatus.Up) continue;
            var adapterName = $"{adapter.Name} {adapter.Description}".ToLowerInvariant();
            if (VpnAdapterNameTokens.Any(token => adapterName.Contains(token)))
            {
                return true;
            }
        }

        return false;
    }

    private static string BuildUrl(string baseUrl, string relativePath)
    {
        return $"{baseUrl.TrimEnd('/')}/{relativePath.TrimStart('/')}";
    }

    private string ResolveOpenBaseOrThrow()
    {
        var target = NormalizeOpenTarget(GetComboSelectedTag(OpenTargetComboBox));
        if (target == "internal" && DevModeCheckBox.IsChecked != true && IsVpnAdapterActive())
        {
            var port = _detectedPort ?? ParsePortOrDefault();
            if (port is >= 1 and <= 65535)
            {
                return $"http://127.0.0.1:{port}";
            }
        }

        var selected = target == "external" ? _externalBaseUrl : _internalBaseUrl;
        selected ??= target == "external" ? _internalBaseUrl : _externalBaseUrl;

        if (string.IsNullOrWhiteSpace(selected))
        {
            throw new InvalidOperationException("Ссылка недоступна. Проверьте сетевые настройки и порт.");
        }

        return selected;
    }

    private string BuildOverlayUrlOrThrow()
    {
        var room = RoomCodeTextBox.Text.Trim();
        if (room.Length == 0 || _viewToken.Length == 0)
        {
            throw new InvalidOperationException("Для оверлея нужны код комнаты и токен просмотра.");
        }

        var baseUrl = ResolveOpenBaseOrThrow();
        return $"{BuildUrl(baseUrl, "overlay")}?room={Uri.EscapeDataString(room)}&token={Uri.EscapeDataString(_viewToken)}";
    }

    private string BuildControlUrlOrThrow()
    {
        var room = RoomCodeTextBox.Text.Trim();
        var token = _editToken.Length > 0 ? _editToken : _hostToken;
        if (room.Length == 0 || token.Length == 0)
        {
            throw new InvalidOperationException("Для контроля нужны код комнаты и edit/host токен.");
        }

        var baseUrl = ResolveOpenBaseOrThrow();
        return $"{BuildUrl(baseUrl, "overlay-control")}?room={Uri.EscapeDataString(room)}&token={Uri.EscapeDataString(token)}";
    }
    private void OpenAppButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            OpenUrl(ResolveOpenBaseOrThrow());
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "Открытие приложения", MessageBoxButton.OK, MessageBoxImage.Information);
        }
    }

    private void OpenOverlayButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            OpenUrl(BuildOverlayUrlOrThrow());
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "Открытие оверлея", MessageBoxButton.OK, MessageBoxImage.Information);
        }
    }

    private void OpenControlButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            OpenUrl(BuildControlUrlOrThrow());
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "Открытие контроля", MessageBoxButton.OK, MessageBoxImage.Information);
        }
    }

    private void InternalUrlHyperlink_Click(object sender, RoutedEventArgs e)
    {
        if (!string.IsNullOrWhiteSpace(_internalBaseUrl)) OpenUrl(_internalBaseUrl);
    }

    private void ExternalUrlHyperlink_Click(object sender, RoutedEventArgs e)
    {
        if (!string.IsNullOrWhiteSpace(_externalBaseUrl)) OpenUrl(_externalBaseUrl);
    }

    private void OpenInternalUrlButton_Click(object sender, RoutedEventArgs e)
    {
        if (!string.IsNullOrWhiteSpace(_internalBaseUrl)) OpenUrl(_internalBaseUrl);
    }

    private void CopyInternalUrlButton_Click(object sender, RoutedEventArgs e)
    {
        if (!string.IsNullOrWhiteSpace(_internalBaseUrl)) Clipboard.SetText(_internalBaseUrl);
    }

    private void OpenExternalUrlButton_Click(object sender, RoutedEventArgs e)
    {
        if (!string.IsNullOrWhiteSpace(_externalBaseUrl)) OpenUrl(_externalBaseUrl);
    }

    private void CopyExternalUrlButton_Click(object sender, RoutedEventArgs e)
    {
        if (!string.IsNullOrWhiteSpace(_externalBaseUrl)) Clipboard.SetText(_externalBaseUrl);
    }

    private static void OpenUrl(string url)
    {
        Process.Start(new ProcessStartInfo
        {
            FileName = url,
            UseShellExecute = true,
        });
    }

    private async void CheckUpdatesButton_Click(object sender, RoutedEventArgs e)
    {
        await CheckUpdatesAsync(interactive: true);
    }

    private void OpenReleasesButton_Click(object sender, RoutedEventArgs e)
    {
        OpenUrl(ReleasesPage);
    }

    private void FooterGithubHyperlink_Click(object sender, RoutedEventArgs e)
    {
        OpenUrl("https://github.com/FHRha");
    }

    private async Task CheckUpdatesAsync(bool interactive)
    {
        try
        {
            var release = await FetchLatestReleaseAsync();
            if (release is null)
            {
                if (interactive)
                {
                    MessageBox.Show("Не удалось получить данные о релизах GitHub.", "Обновления", MessageBoxButton.OK, MessageBoxImage.Information);
                }
                return;
            }

            AppendLine($"Последний релиз: {release.Tag}");
            var currentRaw = ReadCurrentVersion();
            var current = NormalizeVersionForCompare(currentRaw);
            var latest = NormalizeVersionForCompare(release.Tag);
            if (current.Length > 0 && latest.Length > 0 &&
                string.Equals(current, latest, StringComparison.OrdinalIgnoreCase))
            {
                if (interactive)
                {
                    MessageBox.Show($"У вас уже актуальная версия ({currentRaw}).", "Обновления", MessageBoxButton.OK, MessageBoxImage.Information);
                }
                return;
            }

            if (!interactive)
            {
                AppendLine($"Доступно обновление: {release.Tag} (текущая: {currentRaw}).", LogLevel.Warn);
                return;
            }

            var answer = MessageBox.Show(
                $"Доступна новая версия: {release.Tag}\nТекущая версия: {currentRaw}\n\nСкачать и обновить сейчас?",
                "Доступно обновление",
                MessageBoxButton.YesNo,
                MessageBoxImage.Question);
            if (answer != MessageBoxResult.Yes) return;

            var downloadedZip = await DownloadReleaseAssetAsync(release.Url);
            if (downloadedZip is null)
            {
                MessageBox.Show("Не удалось скачать пакет обновления.", "Обновления", MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }

            if (IsServerRunning)
            {
                await StopServerAsync(userRequested: false);
            }

            if (!File.Exists(_updaterPath))
            {
                MessageBox.Show("Не найден UpdaterHelper.exe. Открываю страницу релизов.", "Обновления", MessageBoxButton.OK, MessageBoxImage.Warning);
                OpenUrl(ReleasesPage);
                return;
            }

            var args = $"--pid {Environment.ProcessId} --install-dir \"{_installDir}\" --zip \"{downloadedZip}\" --launcher \"ProtocolBunker.exe\"";
            Process.Start(new ProcessStartInfo
            {
                FileName = _updaterPath,
                Arguments = args,
                WorkingDirectory = _installDir,
                UseShellExecute = false,
                CreateNoWindow = true,
            });

            _closingAfterStop = true;
            Close();
        }
        catch (Exception ex)
        {
            AppendLine($"Ошибка обновления: {ex.Message}", LogLevel.Error);
            if (interactive)
            {
                MessageBox.Show(ex.Message, "Обновления", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
    }

    private static string NormalizeVersionForCompare(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return string.Empty;
        var value = raw.Trim();
        while (value.StartsWith("v", StringComparison.OrdinalIgnoreCase))
        {
            value = value[1..].TrimStart();
        }
        return value;
    }

    private async Task<ReleaseInfo?> FetchLatestReleaseAsync()
    {
        using var response = await _httpClient.GetAsync(ReleasesApi);
        if (!response.IsSuccessStatusCode) return null;

        await using var stream = await response.Content.ReadAsStreamAsync();
        using var doc = await JsonDocument.ParseAsync(stream);
        var root = doc.RootElement;

        var tag = root.TryGetProperty("tag_name", out var tagElement) ? tagElement.GetString() ?? string.Empty : string.Empty;
        if (string.IsNullOrWhiteSpace(tag)) return null;
        if (!root.TryGetProperty("assets", out var assets) || assets.ValueKind != JsonValueKind.Array) return null;

        foreach (var wantedPattern in PreferredUpdateAssetPatterns)
        {
            foreach (var asset in assets.EnumerateArray())
            {
                var name = asset.GetProperty("name").GetString() ?? string.Empty;
                if (!wantedPattern.IsMatch(name)) continue;
                var url = asset.GetProperty("browser_download_url").GetString() ?? string.Empty;
                if (!string.IsNullOrWhiteSpace(url)) return new ReleaseInfo(tag, url);
            }
        }

        return null;
    }

    private async Task<string?> DownloadReleaseAssetAsync(string url)
    {
        var path = Path.Combine(Path.GetTempPath(), $"protocol-bunker-update-{Guid.NewGuid():N}.zip");
        using var response = await _httpClient.GetAsync(url, HttpCompletionOption.ResponseHeadersRead);
        if (!response.IsSuccessStatusCode) return null;

        await using var input = await response.Content.ReadAsStreamAsync();
        await using var output = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.None);
        await input.CopyToAsync(output);
        return path;
    }
    private void AppendLine(string message, LogLevel level = LogLevel.Info)
    {
        var entry = new LogEntry
        {
            Timestamp = DateTime.Now,
            Level = level,
            Message = message,
        };

        _allLogs.Add(entry);
        while (_allLogs.Count > MaxLogLines)
        {
            _allLogs.RemoveAt(0);
        }

        var launcherLine = $"[{entry.Timestamp:HH:mm:ss}] [{level.ToString().ToUpperInvariant()}] {message}";
        lock (_launcherLogLock)
        {
            File.AppendAllText(_launcherLogPath, launcherLine + Environment.NewLine, Encoding.UTF8);
        }

        RefreshLogView();
    }

    private Brush LevelBrush(LogLevel level)
    {
        return level switch
        {
            LogLevel.Warn => new SolidColorBrush(_currentPalette.LogWarnColor),
            LogLevel.Error => new SolidColorBrush(_currentPalette.LogErrorColor),
            _ => new SolidColorBrush(_currentPalette.LogInfoColor),
        };
    }

    private void RefreshLogView()
    {
        var search = SearchLogTextBox.Text.Trim();
        var hasSearch = search.Length > 0;

        _visibleLogs.Clear();
        foreach (var entry in _allLogs)
        {
            var line = $"[{entry.Timestamp:HH:mm:ss}] [{entry.Level.ToString().ToUpperInvariant()}] {entry.Message}";
            if (hasSearch && line.IndexOf(search, StringComparison.OrdinalIgnoreCase) < 0) continue;
            _visibleLogs.Add(new LogEntryView { Text = line, Foreground = LevelBrush(entry.Level) });
        }

        if (AutoScrollCheckBox.IsChecked == true && _visibleLogs.Count > 0)
        {
            LogListBox.ScrollIntoView(_visibleLogs[^1]);
        }
    }

    private void SearchLogTextBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        RefreshLogView();
    }

    private void CopyLogButton_Click(object sender, RoutedEventArgs e)
    {
        var lines = _visibleLogs.Select(item => item.Text);
        Clipboard.SetText(string.Join(Environment.NewLine, lines));
    }

    private void ClearLogButton_Click(object sender, RoutedEventArgs e)
    {
        _allLogs.Clear();
        _visibleLogs.Clear();
        File.WriteAllText(_launcherLogPath, string.Empty, Encoding.UTF8);
    }

    private void BrowseDataFolderButton_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new OpenFolderDialog { Title = "Выберите папку данных" };
        var initial = ResolvePath(DataFolderTextBox.Text.Trim());
        if (Directory.Exists(initial)) dialog.InitialDirectory = initial;

        if (dialog.ShowDialog() == true)
        {
            DataFolderTextBox.Text = dialog.FolderName;
            UpdateLinksAndFiles();
        }
    }

    private void OpenDataFolderButton_Click(object sender, RoutedEventArgs e)
    {
        var path = ResolvePath(DataFolderTextBox.Text.Trim());
        Directory.CreateDirectory(path);
        Process.Start(new ProcessStartInfo { FileName = path, UseShellExecute = true });
    }

    private string SelectLanIp()
    {
        var bestIp = "127.0.0.1";
        var bestScore = -1;

        foreach (var adapter in NetworkInterface.GetAllNetworkInterfaces())
        {
            if (adapter.OperationalStatus != OperationalStatus.Up) continue;

            var adapterName = $"{adapter.Name} {adapter.Description}".ToLowerInvariant();
            var blocked = VpnAdapterNameTokens.Any(token => adapterName.Contains(token));
            var props = adapter.GetIPProperties();
            var hasGateway = props.GatewayAddresses.Any(g => g.Address.AddressFamily == AddressFamily.InterNetwork && !g.Address.Equals(IPAddress.Any));

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

        return bestIp;
    }

    private void UpdateStatus()
    {
        var running = IsServerRunning;
        StartButton.IsEnabled = !running && !_isStopInProgress;
        StopButton.IsEnabled = running && !_isStopInProgress;

        StatusValueTextBlock.Text = _isStopInProgress
            ? "Остановка..."
            : running ? "Запущен" : "Остановлен";
        StatusValueTextBlock.FontWeight = running ? FontWeights.SemiBold : FontWeights.Normal;

        PidValueTextBlock.Text = running && _serverProcess is not null
            ? _serverProcess.Id.ToString(CultureInfo.InvariantCulture)
            : "-";

        AnimateCard(StatusCard);
    }

    private void AnimateCard(Border card)
    {
        var fade = new DoubleAnimation
        {
            From = 0.86,
            To = 1,
            Duration = TimeSpan.FromMilliseconds(180),
            EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseOut },
        };

        card.BeginAnimation(OpacityProperty, fade, HandoffBehavior.SnapshotAndReplace);

        if (card.RenderTransform is TranslateTransform translate)
        {
            var slide = new DoubleAnimation
            {
                From = 4,
                To = 0,
                Duration = TimeSpan.FromMilliseconds(180),
                EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseOut },
            };
            translate.BeginAnimation(TranslateTransform.YProperty, slide, HandoffBehavior.SnapshotAndReplace);
        }
    }

    private void InitializeTrayIcon()
    {
        try
        {
            _trayIcon = new Forms.NotifyIcon
            {
                Text = "Protocol: Bunker",
                Visible = true,
                Icon = TryGetTrayIcon() ?? System.Drawing.SystemIcons.Application,
            };

            var menu = new Forms.ContextMenuStrip();
            menu.Items.Add("Открыть", null, (_, _) => Dispatcher.BeginInvoke(new Action(RestoreFromTray)));
            menu.Items.Add("Выход", null, (_, _) => Dispatcher.BeginInvoke(new Action(() =>
            {
                RestoreFromTray();
                Close();
            })));

            _trayIcon.ContextMenuStrip = menu;
            _trayIcon.DoubleClick += (_, _) => Dispatcher.BeginInvoke(new Action(RestoreFromTray));
        }
        catch (Exception ex)
        {
            AppendLine($"Не удалось инициализировать трей: {ex.Message}", LogLevel.Warn);
        }
    }

    private DrawingIcon? TryGetTrayIcon()
    {
        foreach (var path in EnumerateIconCandidates())
        {
            if (!File.Exists(path)) continue;
            try
            {
                return new DrawingIcon(path);
            }
            catch
            {
                // ignore
            }
        }

        return null;
    }

    private void OnWindowStateChanged(object? sender, EventArgs e)
    {
        if (WindowState != WindowState.Minimized || MinimizeToTrayCheckBox.IsChecked != true)
        {
            return;
        }

        Hide();

        if (_trayIcon is not null && !_trayBalloonShown)
        {
            _trayIcon.ShowBalloonTip(
                2500,
                "Protocol: Bunker",
                "Лаунчер свернут в трей. Дважды кликните по иконке, чтобы вернуть окно.",
                Forms.ToolTipIcon.Info);
            _trayBalloonShown = true;
        }
    }

    private void RestoreFromTray()
    {
        if (!IsVisible)
        {
            Show();
        }

        if (WindowState == WindowState.Minimized)
        {
            WindowState = WindowState.Normal;
        }

        Activate();
    }

    private void OnWindowClosed(object? sender, EventArgs e)
    {
        ForceStopServerProcessIfRunning();
        DisposeTrayIcon();
        _httpClient.Dispose();
    }

    private void ForceStopServerProcessIfRunning()
    {
        var process = _serverProcess;
        if (process is null) return;

        try
        {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
                process.WaitForExit(1500);
            }
        }
        catch
        {
            // best effort
        }

        try
        {
            CleanupProcessResources(process);
        }
        catch
        {
            // best effort
        }
    }

    private void DisposeTrayIcon()
    {
        if (_trayIcon is null) return;

        try
        {
            _trayIcon.Visible = false;
            _trayIcon.Dispose();
        }
        catch
        {
            // ignored
        }

        _trayIcon = null;
    }

    private async void OnWindowClosing(object? sender, CancelEventArgs e)
    {
        SaveLauncherSettings();

        if (_closingAfterStop || !IsServerRunning)
        {
            ForceStopServerProcessIfRunning();
            return;
        }

        e.Cancel = true;
        _closingAfterStop = true;
        await StopServerAsync(userRequested: false);
        Close();
    }

    private void TryLoadWindowIcon()
    {
        foreach (var candidate in EnumerateIconCandidates())
        {
            if (!File.Exists(candidate)) continue;
            try
            {
                Icon = BitmapFrame.Create(
                    new Uri(candidate, UriKind.Absolute),
                    BitmapCreateOptions.IgnoreImageCache,
                    BitmapCacheOption.OnLoad);
                return;
            }
            catch
            {
                // ignore
            }
        }
    }

    private IEnumerable<string> EnumerateIconCandidates()
    {
        yield return Path.Combine(_installDir, "icons", "app.ico");
        yield return Path.Combine(_installDir, "icons", "favicon.ico");
        yield return Path.Combine(_appDir, "icons", "app.ico");
        yield return Path.Combine(_appDir, "icons", "favicon.ico");
        yield return Path.Combine(_installDir, "app.ico");
        yield return Path.Combine(_installDir, "favicon.ico");
    }

    private sealed record LaunchSettings(
        int Port,
        string Mode,
        string Domain,
        string PublicHost,
        string DataFolderRaw,
        string DataFolderPath,
        bool DevMode,
        string RoomCode,
        string HostToken,
        string ViewToken,
        string EditToken);

    private sealed record ReleaseInfo(string Tag, string Url);
}
