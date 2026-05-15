using System.Diagnostics;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Globalization;
using ProtocolBunker.Desktop.Contracts.Models;
using ProtocolBunker.Desktop.Contracts.Services;

namespace ProtocolBunker.Desktop.Infrastructure.Services;

public sealed class DesktopRuntimeService : IRuntimeService
{
    private static readonly Regex PortMarkerRegex = new("__BUNKER_PORT__=(\\d{1,5})", RegexOptions.Compiled);
    private static readonly Regex UrlPortRegex = new("https?://\\S+:(\\d{2,5})", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex ListeningRegex = new("listening", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex AnsiEscapeRegex = new("\u001B\\[[0-?]*[ -/]*[@-~]", RegexOptions.Compiled);
    private static readonly Regex ControlCharsRegex = new("[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]", RegexOptions.Compiled);

    private readonly IDesktopSettingsService _desktopSettingsService;
    private readonly ILocalizationService _localizationService;
    private readonly DesktopApiSessionService _desktopApiSessionService;
    private readonly SemaphoreSlim _lifecycleLock = new(1, 1);
    private readonly HttpClient _httpClient = new() { Timeout = TimeSpan.FromSeconds(1.5) };

    private Process? _process;
    private RuntimeState _runtimeState = RuntimeState.Stopped;
    private int? _detectedPort;
    private string _statusDetail = string.Empty;
    private string? _statusDetailKey;
    private object[] _statusDetailArgs = [];

    public event EventHandler<RuntimeOutputEventArgs>? OutputReceived;
    public event EventHandler? StateChanged;

    private const string PublicBaseLogPrefix = "[links] publicBase source=";

    public DesktopRuntimeService(
        IDesktopSettingsService desktopSettingsService,
        ILocalizationService localizationService,
        DesktopApiSessionService desktopApiSessionService)
    {
        _desktopSettingsService = desktopSettingsService;
        _localizationService = localizationService;
        _desktopApiSessionService = desktopApiSessionService;
        SetLocalizedStatus("runtime.status.not_started");
    }

    public async Task<HomeStatusSnapshot> GetHomeStatusAsync(DesktopSettingsModel? settingsOverride = null, CancellationToken cancellationToken = default)
    {
        var appBaseDir = Path.GetFullPath(AppContext.BaseDirectory);
        var installedAppDir = Path.Combine(appBaseDir, "app");
        var installedVersionPath = Path.Combine(installedAppDir, "VERSION");
        var installedDataDir = Path.Combine(installedAppDir, "data");
        var settings = settingsOverride ?? await _desktopSettingsService.LoadAsync(cancellationToken);

        if (!string.IsNullOrWhiteSpace(_statusDetailKey))
        {
            SetLocalizedStatus(_statusDetailKey!, _statusDetailArgs);
        }

        if (_process is not null && IsProcessExitedOrDetached(_process))
        {
            CleanupExitedProcess();
        }

        if (File.Exists(installedVersionPath))
        {
            var installedVersion = SafeReadTrimmed(installedVersionPath) ?? _localizationService.Get("runtime.unknown");
            return new HomeStatusSnapshot(
                Version: installedVersion,
                RuntimeState: _runtimeState,
                ActiveMode: NormalizeMode(settings.Mode),
                Port: _detectedPort ?? settings.Port,
                RoomCode: settings.RoomCode,
                ReachabilitySummary: BuildReachabilitySummary(settings, isDevelopment: false),
                RuntimeSource: _localizationService.Get("runtime.source.portable"),
                InstallRoot: appBaseDir,
                AppRoot: installedAppDir,
                DataRoot: settings.DataFolder,
                ProcessId: GetProcessId(),
                StatusDetail: _statusDetail);
        }

        var repoRoot = FindRepoRoot(appBaseDir);
        if (repoRoot is not null)
        {
            var packageJsonPath = Path.Combine(repoRoot, "package.json");
            var version = ReadPackageVersion(packageJsonPath) ?? _localizationService.Get("runtime.unknown");
            return new HomeStatusSnapshot(
                Version: version,
                RuntimeState: _runtimeState,
                ActiveMode: NormalizeMode(settings.Mode),
                Port: _detectedPort ?? settings.Port,
                RoomCode: settings.RoomCode,
                ReachabilitySummary: BuildReachabilitySummary(settings, isDevelopment: true),
                RuntimeSource: _localizationService.Get("runtime.source.repo"),
                InstallRoot: repoRoot,
                AppRoot: Path.Combine(repoRoot, "server"),
                DataRoot: settings.DataFolder,
                ProcessId: GetProcessId(),
                StatusDetail: _statusDetail);
        }

        return new HomeStatusSnapshot(
            Version: _localizationService.Get("runtime.unknown"),
            RuntimeState: RuntimeState.Error,
            ActiveMode: NormalizeMode(settings.Mode),
            Port: 0,
            RoomCode: settings.RoomCode,
            ReachabilitySummary: _localizationService.Get("runtime.reachability.unresolved"),
            RuntimeSource: _localizationService.Get("runtime.source.unresolved"),
            InstallRoot: appBaseDir,
            AppRoot: string.Empty,
            DataRoot: settings.DataFolder,
            ProcessId: null,
            StatusDetail: _localizationService.Get("runtime.status.unresolved"));
    }

    public async Task<RuntimeActionResult> StartAsync(DesktopSettingsModel? settingsOverride = null, CancellationToken cancellationToken = default)
    {
        await _lifecycleLock.WaitAsync(cancellationToken);
        try
        {
            if (_process is not null && !IsProcessExitedOrDetached(_process))
            {
                return new RuntimeActionResult(false, _localizationService.Get("runtime.action.already_running"));
            }

            var settings = settingsOverride ?? await _desktopSettingsService.LoadAsync(cancellationToken);
            var environment = ResolveRuntimeEnvironment(settings);
            if (!environment.IsUsable)
            {
                _runtimeState = RuntimeState.Error;
                _statusDetail = environment.ErrorMessage ?? _localizationService.Get("runtime.status.not_usable");
                _statusDetailKey = null;
                _statusDetailArgs = [];
                return new RuntimeActionResult(false, _statusDetail);
            }

            if (IsPortBusy(settings.Port))
            {
                _runtimeState = RuntimeState.Error;
                SetLocalizedStatus("runtime.status.port_busy", settings.Port);
                return new RuntimeActionResult(false, _statusDetail);
            }

            _runtimeState = RuntimeState.Starting;
            SetLocalizedStatus("runtime.status.starting");
            _detectedPort = null;

            var startInfo = new ProcessStartInfo
            {
                FileName = environment.ExecutablePath!,
                Arguments = environment.Arguments!,
                WorkingDirectory = environment.WorkingDirectory!,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                RedirectStandardInput = true,
                CreateNoWindow = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8,
            };

            foreach (var pair in environment.Environment)
            {
                startInfo.Environment[pair.Key] = pair.Value;
            }

            var process = new Process
            {
                StartInfo = startInfo,
                EnableRaisingEvents = true,
            };

            process.OutputDataReceived += (_, args) => HandleRuntimeLine(args.Data, isError: false);
            process.ErrorDataReceived += (_, args) => HandleRuntimeLine(args.Data, isError: true);
            process.Exited += (_, _) =>
            {
                _runtimeState = RuntimeState.Stopped;
                if (TryGetExitCode(process, out var exitCode))
                {
                    SetLocalizedStatus("runtime.status.exited_with_code", exitCode);
                }
                else
                {
                    SetLocalizedStatus("runtime.status.stopped");
                }

                _detectedPort = null;
                RaiseStateChanged();
            };

            if (!process.Start())
            {
                _runtimeState = RuntimeState.Error;
                SetLocalizedStatus("runtime.status.start_failed");
                return new RuntimeActionResult(false, _statusDetail);
            }

            _process = process;
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            _runtimeState = RuntimeState.Starting;
            SetLocalizedStatus("runtime.status.starting");
            RaiseStateChanged();
            _ = MonitorServerReadinessAsync(settings.Port, process);
            return new RuntimeActionResult(true, _localizationService.Get("runtime.action.started"));
        }
        catch (Exception ex)
        {
            _runtimeState = RuntimeState.Error;
            _statusDetail = ex.Message;
            _statusDetailKey = null;
            _statusDetailArgs = [];
            return new RuntimeActionResult(false, ex.Message);
        }
        finally
        {
            _lifecycleLock.Release();
        }
    }

    public async Task<RuntimeActionResult> StopAsync(CancellationToken cancellationToken = default)
    {
        await _lifecycleLock.WaitAsync(cancellationToken);
        try
        {
            var process = _process;
            if (process is null || IsProcessExitedOrDetached(process))
            {
                return CompleteStopAsStopped();
            }

            _runtimeState = RuntimeState.Stopping;
            SetLocalizedStatus("runtime.status.stopping");
            RaiseStateChanged();

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

            var stopped = await WaitForExitWithTimeoutAsync(process, 2500, cancellationToken);
            if (!stopped)
            {
                try
                {
                    process.Kill(entireProcessTree: true);
                }
                catch
                {
                    // ignored
                }

                await WaitForExitWithTimeoutAsync(process, 2500, cancellationToken);
            }

            return CompleteStopAsStopped();
        }
        catch (InvalidOperationException)
        {
            return CompleteStopAsStopped();
        }
        catch (Exception ex)
        {
            _runtimeState = RuntimeState.Error;
            _statusDetail = ex.Message;
            _statusDetailKey = null;
            _statusDetailArgs = [];
            return new RuntimeActionResult(false, ex.Message);
        }
        finally
        {
            _lifecycleLock.Release();
        }
    }

    private RuntimeEnvironment ResolveRuntimeEnvironment(DesktopSettingsModel settings)
    {
        var appBaseDir = Path.GetFullPath(AppContext.BaseDirectory);
        var installedAppDir = Path.Combine(appBaseDir, "app");
        var installedServerEntry = Path.Combine(installedAppDir, "server", "dist", "index.js");
        var installedNode = Path.Combine(installedAppDir, "node", "node.exe");

        if (File.Exists(installedServerEntry) && File.Exists(installedNode))
        {
            var env = BuildCommonEnvironment(
                port: settings.Port,
                isDevelopment: false,
                appRoot: installedAppDir,
                dataDir: GetDataDirFromSettings(settings),
                aiAccessKeysFile: Path.Combine(ResolveDataDir(settings, appBaseDir), "ai-access-keys.json"),
                aiGatewayBaseUrl: settings.AiGatewayBaseUrl,
                aiGatewayApiKey: settings.AiGatewayApiKey,
                aiGatewayModel: settings.AiGatewayModel,
                aiGatewayTimeoutMs: settings.AiGatewayTimeoutMs,
                publicOrigin: BuildPublicOrigin(settings),
                mode: GetModeFromSettings(settings),
                devMode: settings.DeveloperMode);
            env[DesktopApiSessionService.EnvironmentVariableName] = _desktopApiSessionService.Secret;

            return new RuntimeEnvironment(
                true,
                installedNode,
                $"\"{installedServerEntry}\"",
                Path.Combine(installedAppDir, "server"),
                env,
                null);
        }

        var repoRoot = FindRepoRoot(appBaseDir);
        if (repoRoot is not null)
        {
            var builtServerEntry = Path.Combine(repoRoot, "server", "dist", "index.js");
            var builtClientDist = Path.Combine(repoRoot, "client", "dist");
            var assetsRoot = Path.Combine(repoRoot, "assets");

            if (!File.Exists(builtServerEntry))
            {
                return new RuntimeEnvironment(
                    false,
                    null,
                    null,
                    null,
                    new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase),
                    _localizationService.Get("runtime.error.missing_built_server"));
            }

            var env = BuildCommonEnvironment(
                port: settings.Port,
                isDevelopment: true,
                appRoot: repoRoot,
                dataDir: GetDataDirFromSettings(settings),
                aiAccessKeysFile: Path.Combine(ResolveDataDir(settings, repoRoot), "ai-access-keys.json"),
                aiGatewayBaseUrl: settings.AiGatewayBaseUrl,
                aiGatewayApiKey: settings.AiGatewayApiKey,
                aiGatewayModel: settings.AiGatewayModel,
                aiGatewayTimeoutMs: settings.AiGatewayTimeoutMs,
                publicOrigin: BuildPublicOrigin(settings),
                mode: GetModeFromSettings(settings),
                devMode: settings.DeveloperMode);

            env["BUNKER_ASSETS_ROOT"] = assetsRoot;
            env["BUNKER_CLIENT_DIST"] = builtClientDist;
            env[DesktopApiSessionService.EnvironmentVariableName] = _desktopApiSessionService.Secret;

            return new RuntimeEnvironment(
                true,
                "node",
                $"\"{builtServerEntry}\"",
                Path.Combine(repoRoot, "server"),
                env,
                null);
        }

        return new RuntimeEnvironment(
            false,
            null,
            null,
            null,
            new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase),
            _localizationService.Get("runtime.error.environment_unresolved"));
    }

    private Dictionary<string, string> BuildCommonEnvironment(
        int port,
        bool isDevelopment,
        string appRoot,
        string dataDir,
        string aiAccessKeysFile,
        string aiGatewayBaseUrl,
        string aiGatewayApiKey,
        string aiGatewayModel,
        int aiGatewayTimeoutMs,
        string? publicOrigin,
        string mode,
        bool devMode)
    {
        var env = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["PORT"] = port.ToString(),
            ["BUNKER_SERVE_CLIENT"] = "true",
            ["BUNKER_PORTABLE"] = "1",
            ["BUNKER_DATA_DIR"] = dataDir,
            ["BUNKER_AI_ACCESS_KEYS_FILE"] = aiAccessKeysFile,
            ["BUNKER_AI_GATEWAY_BASE_URL"] = aiGatewayBaseUrl?.Trim() ?? string.Empty,
            ["BUNKER_AI_GATEWAY_API_KEY"] = aiGatewayApiKey?.Trim() ?? string.Empty,
            ["BUNKER_AI_GATEWAY_MODEL"] = string.IsNullOrWhiteSpace(aiGatewayModel) ? "gpt-4o-mini" : aiGatewayModel.Trim(),
            ["BUNKER_AI_GATEWAY_TIMEOUT_MS"] = aiGatewayTimeoutMs.ToString(CultureInfo.InvariantCulture),
            ["BUNKER_ENABLE_DEV_SCENARIOS"] = devMode ? "true" : "false",
            ["BUNKER_IDENTITY_MODE"] = devMode ? "dev_tab" : "prod",
            ["BUNKER_DEV_LOGS"] = devMode ? "true" : "false",
            ["VITE_IDENTITY_MODE"] = devMode ? "dev_tab" : "prod",
            ["DEV_NEW_PLAYER_PER_TAB"] = devMode ? "true" : "false",
            ["VITE_DEV_TAB_IDENTITY"] = devMode ? "true" : "false",
            ["VITE_DEV_NEW_PLAYER_PER_TAB"] = devMode ? "true" : "false",
        };

        if (isDevelopment)
        {
            env["BUNKER_ASSETS_ROOT"] = Path.Combine(appRoot, "assets");
            env["BUNKER_CLIENT_DIST"] = Path.Combine(appRoot, "client", "dist");
        }

        if (string.Equals(mode, "domain", StringComparison.OrdinalIgnoreCase))
        {
            env["HOST"] = "127.0.0.1";
            env["TRUST_PROXY"] = "true";
            if (!string.IsNullOrWhiteSpace(publicOrigin))
            {
                env["PUBLIC_ORIGIN"] = publicOrigin;
            }
        }
        else
        {
            env["HOST"] = "0.0.0.0";
            env["TRUST_PROXY"] = "false";
            if (!string.IsNullOrWhiteSpace(publicOrigin))
            {
                env["PUBLIC_ORIGIN"] = publicOrigin;
            }
        }

        return env;
    }

    private static string GetDataDirFromSettings(DesktopSettingsModel settings)
    {
        return string.IsNullOrWhiteSpace(settings.DataFolder) ? "app/data" : settings.DataFolder;
    }

    private static string ResolveDataDir(DesktopSettingsModel settings, string baseDir)
    {
        var raw = GetDataDirFromSettings(settings).Trim();
        return Path.GetFullPath(Path.IsPathRooted(raw) ? raw : Path.Combine(baseDir, raw));
    }

    private static string GetModeFromSettings(DesktopSettingsModel settings)
    {
        return NormalizeMode(settings.Mode);
    }

    private static string? BuildPublicOrigin(DesktopSettingsModel settings)
    {
        var mode = NormalizeMode(settings.Mode);
        if (mode == "domain" && !string.IsNullOrWhiteSpace(settings.Domain))
        {
            return $"https://{settings.Domain.Trim()}";
        }

        if (mode != "domain" && !string.IsNullOrWhiteSpace(settings.PublicHost))
        {
            return $"http://{settings.PublicHost.Trim()}:{settings.Port}";
        }

        return null;
    }

    private void HandleRuntimeLine(string? line, bool isError)
    {
        if (string.IsNullOrWhiteSpace(line))
        {
            return;
        }

        line = NormalizeConsoleLine(line);
        if (string.IsNullOrWhiteSpace(line))
        {
            return;
        }

        if (line.StartsWith(PublicBaseLogPrefix, StringComparison.Ordinal))
        {
            return;
        }

        OutputReceived?.Invoke(this, new RuntimeOutputEventArgs(
            new RuntimeOutputEntry(
                Timestamp: DateTimeOffset.UtcNow,
                Text: line,
                IsError: isError)));

        var marker = PortMarkerRegex.Match(line);
        if (marker.Success && int.TryParse(marker.Groups[1].Value, out var markerPort))
        {
            _detectedPort = markerPort;
            _runtimeState = RuntimeState.Running;
            SetLocalizedStatus("runtime.status.listening_port", markerPort);
            RaiseStateChanged();
            return;
        }

        if (ListeningRegex.IsMatch(line))
        {
            var portMatch = UrlPortRegex.Match(line);
            if (portMatch.Success && int.TryParse(portMatch.Groups[1].Value, out var parsedPort))
            {
                _detectedPort = parsedPort;
                _runtimeState = RuntimeState.Running;
                SetLocalizedStatus("runtime.status.listening_port", parsedPort);
                RaiseStateChanged();
                return;
            }

            _statusDetail = line.Trim();
            _statusDetailKey = null;
            _statusDetailArgs = [];
            return;
        }

        if (isError)
        {
            _statusDetail = line.Trim();
            _statusDetailKey = null;
            _statusDetailArgs = [];
        }
    }

    private async Task MonitorServerReadinessAsync(int fallbackPort, Process startedProcess)
    {
        for (var attempt = 0; attempt < 60; attempt++)
        {
            await Task.Delay(500).ConfigureAwait(false);

            if (!ReferenceEquals(_process, startedProcess))
            {
                return;
            }

            try
            {
                if (startedProcess.HasExited)
                {
                    return;
                }
            }
            catch
            {
                return;
            }

            var port = _detectedPort ?? fallbackPort;
            if (port <= 0)
            {
                continue;
            }

            if (!await IsDesktopEndpointReadyAsync(port).ConfigureAwait(false))
            {
                continue;
            }

            _detectedPort = port;
            _runtimeState = RuntimeState.Running;
            SetLocalizedStatus("runtime.status.listening_port", port);
            RaiseStateChanged();
            return;
        }
    }

    private async Task<bool> IsDesktopEndpointReadyAsync(int port)
    {
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, $"http://127.0.0.1:{port}/api/desktop/endpoints");
            request.Headers.Add("x-bunker-desktop-secret", _desktopApiSessionService.Secret);
            request.Content = new StringContent("{}", Encoding.UTF8, "application/json");

            using var response = await _httpClient.SendAsync(request).ConfigureAwait(false);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    private static string NormalizeConsoleLine(string line)
    {
        var normalized = line.Replace("\r", string.Empty);
        normalized = AnsiEscapeRegex.Replace(normalized, string.Empty);
        normalized = ControlCharsRegex.Replace(normalized, string.Empty);
        return normalized.TrimEnd();
    }

    private void CleanupExitedProcess()
    {
        try
        {
            _process?.Dispose();
        }
        catch
        {
            // ignored
        }

        _process = null;
        _detectedPort = null;
        if (_runtimeState != RuntimeState.Error)
        {
            _runtimeState = RuntimeState.Stopped;
            SetLocalizedStatus("runtime.status.not_started");
            RaiseStateChanged();
        }
    }

    private RuntimeActionResult CompleteStopAsStopped()
    {
        CleanupExitedProcess();
        _runtimeState = RuntimeState.Stopped;
        SetLocalizedStatus("runtime.status.stopped");
        RaiseStateChanged();
        return new RuntimeActionResult(true, _localizationService.Get("runtime.action.stopped"));
    }

    private void RaiseStateChanged() => StateChanged?.Invoke(this, EventArgs.Empty);

    private void SetLocalizedStatus(string key, params object[] args)
    {
        _statusDetailKey = key;
        _statusDetailArgs = args;
        _statusDetail = args.Length == 0
            ? _localizationService.Get(key)
            : string.Format(CultureInfo.CurrentUICulture, _localizationService.Get(key), args);
    }

    private int? GetProcessId()
    {
        try
        {
            return _process is not null && !IsProcessExitedOrDetached(_process) ? _process.Id : null;
        }
        catch
        {
            return null;
        }
    }

    private static bool IsProcessExitedOrDetached(Process process)
    {
        try
        {
            return process.HasExited;
        }
        catch (InvalidOperationException)
        {
            return true;
        }
    }

    private static bool TryGetExitCode(Process process, out int exitCode)
    {
        try
        {
            exitCode = process.ExitCode;
            return true;
        }
        catch (InvalidOperationException)
        {
            exitCode = 0;
            return false;
        }
    }

    private static async Task<bool> WaitForExitWithTimeoutAsync(Process process, int timeoutMs, CancellationToken cancellationToken)
    {
        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            cts.CancelAfter(timeoutMs);
            await process.WaitForExitAsync(cts.Token);
            return true;
        }
        catch
        {
            return IsProcessExitedOrDetached(process);
        }
    }

    private static bool IsPortBusy(int port)
    {
        try
        {
            var listeners = System.Net.NetworkInformation.IPGlobalProperties
                .GetIPGlobalProperties()
                .GetActiveTcpListeners();
            return listeners.Any(endpoint => endpoint.Port == port);
        }
        catch
        {
            return false;
        }
    }

    private string BuildReachabilitySummary(DesktopSettingsModel settings, bool isDevelopment)
    {
        var mode = NormalizeMode(settings.Mode);
        if (mode == "domain")
        {
            if (string.IsNullOrWhiteSpace(settings.Domain))
            {
                return _localizationService.Get("runtime.reachability.domain_missing");
            }

            return string.Format(CultureInfo.CurrentUICulture, _localizationService.Get("runtime.reachability.domain_mode"), settings.Domain.Trim());
        }

        if (!string.IsNullOrWhiteSpace(settings.PublicHost))
        {
            return string.Format(CultureInfo.CurrentUICulture, _localizationService.Get("runtime.reachability.local_external"), settings.PublicHost.Trim(), settings.Port);
        }

        if (settings.DeveloperMode)
        {
            return _localizationService.Get("runtime.reachability.dev_local");
        }

        return isDevelopment
            ? _localizationService.Get("runtime.reachability.standard_local")
            : _localizationService.Get("runtime.reachability.portable_local");
    }

    private static string NormalizeMode(string? mode)
    {
        return string.Equals(mode?.Trim(), "domain", StringComparison.OrdinalIgnoreCase)
            ? "domain"
            : "local";
    }

    private static string? FindRepoRoot(string startDir)
    {
        var current = new DirectoryInfo(startDir);
        while (current is not null)
        {
            var packageJsonPath = Path.Combine(current.FullName, "package.json");
            var solutionPath = Path.Combine(current.FullName, "Protocol_Bunker.sln");
            if (File.Exists(packageJsonPath) && File.Exists(solutionPath))
            {
                return current.FullName;
            }

            current = current.Parent;
        }

        return null;
    }

    private static string? ReadPackageVersion(string packageJsonPath)
    {
        try
        {
            using var stream = File.OpenRead(packageJsonPath);
            using var document = JsonDocument.Parse(stream);
            if (document.RootElement.TryGetProperty("version", out var versionProperty))
            {
                var value = versionProperty.GetString();
                return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
            }
        }
        catch
        {
            return null;
        }

        return null;
    }

    private static string? SafeReadTrimmed(string path)
    {
        try
        {
            var value = File.ReadAllText(path).Trim();
            return string.IsNullOrWhiteSpace(value) ? null : value;
        }
        catch
        {
            return null;
        }
    }

    private sealed record RuntimeEnvironment(
        bool IsUsable,
        string? ExecutablePath,
        string? Arguments,
        string? WorkingDirectory,
        Dictionary<string, string> Environment,
        string? ErrorMessage);
}
