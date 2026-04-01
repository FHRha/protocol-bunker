using System.ComponentModel;
using System.Runtime.CompilerServices;
using Avalonia.Media;
using Avalonia.Threading;

namespace ProtocolBunker.Desktop.Setup.Services;

internal sealed class SetupShell : INotifyPropertyChanged
{
    private readonly SetupInstaller _installer;
    private readonly string _setupExePath;
    private readonly DispatcherTimer _asciiTimer;
    private readonly IReadOnlyList<string> _frames;
    private readonly Dictionary<string, Dictionary<string, string>> _texts;
    private int _frameIndex;
    private int _tickCount;
    private int _ellipsisPhase;
    private CancellationTokenSource? _cts;
    private bool _isInstalling;
    private bool _canCancel;
    private string _language = "ru";
    private string _statusKey = "preview.step";
    private string _detailsKey = "preview.details";
    private string? _errorText;

    public event PropertyChangedEventHandler? PropertyChanged;

    public SetupShell(SetupInstaller installer, string[] args)
    {
        _installer = installer;
        _setupExePath = Environment.ProcessPath ?? string.Empty;
        _texts = SetupTexts.Build();
        _frames = SetupAsciiLoader.LoadPlanetFrames();
        _asciiTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(140) };
        _asciiTimer.Tick += (_, _) =>
        {
            _tickCount++;
            if (_frames.Count != 0)
            {
                _frameIndex = (_frameIndex + 1) % _frames.Count;
                OnPropertyChanged(nameof(AsciiFrame));
            }

            if (_isInstalling)
            {
                _ellipsisPhase = (_ellipsisPhase + 1) % 4;
                OnPropertyChanged(nameof(StatusDisplayText));
            }
        };
        _asciiTimer.Start();

        if (!args.Any(a => string.Equals(a, "--preview-ui", StringComparison.OrdinalIgnoreCase)))
        {
            _statusKey = "idle.step";
            _detailsKey = "details.idle";
        }
    }

    public string Title => T("title");
    public string Badge => T("badge");
    public string LanguageLabel => T("language.label");
    public string StatusTitle => T("status.title");
    public string CurrentStepLabel => T("status.current_step");
    public string DetailsLabel => T("status.details");
    public string StartText => T("actions.start");
    public string StopText => T("actions.stop");
    public string FinishText => _isInstalling ? T("actions.close") : T(_completed ? "actions.finish" : "actions.close");
    public string StatusText => T(_statusKey);
    public string StatusDisplayText => _isInstalling ? $"{StatusText}{new string('.', _ellipsisPhase)}" : StatusText;
    public string DetailsText => _errorText is null ? T(_detailsKey) : string.Format(T(_detailsKey), _errorText);
    public string DetailsDisplayText => _isInstalling ? $"{DetailsText}{new string('.', _ellipsisPhase)}" : DetailsText;
    public string AsciiFrame => _frames.Count == 0 ? string.Empty : _frames[_frameIndex];
    public int ProgressValue { get; private set; }
    public bool IsProgressAnimated => !_isInstalling && _statusKey == "preview.step";
    public bool CanStart => !_isInstalling;
    public bool CanStop => _isInstalling && _canCancel;
    public bool CanClose => !_isInstalling;
    public bool ShouldDeleteOnClose => _completed;
    public bool IsRussian => _language == "ru";
    public bool IsEnglish => _language == "en";
    public IBrush RussianBackground => IsRussian ? AccentSoft : PanelStrong;
    public IBrush RussianBorder => IsRussian ? AccentStrong : Stroke;
    public IBrush EnglishBackground => IsEnglish ? AccentSoft : PanelStrong;
    public IBrush EnglishBorder => IsEnglish ? AccentStrong : Stroke;

    private bool _completed;

    private static SolidColorBrush PanelStrong => new(Color.Parse("#31271E"));
    private static SolidColorBrush AccentSoft => new(Color.Parse("#4D381C"));
    private static SolidColorBrush Stroke => new(Color.Parse("#5A442C"));
    private static SolidColorBrush AccentStrong => new(Color.Parse("#F0AE4F"));

    public void SetLanguage(string code)
    {
        _language = _texts.ContainsKey(code) ? code : "en";
        RefreshAll();
    }

    public async Task StartAsync()
    {
        if (_isInstalling)
        {
            return;
        }

        _cts = new CancellationTokenSource();
        _isInstalling = true;
        _canCancel = true;
        _completed = false;
        _errorText = null;
        _ellipsisPhase = 0;
        ProgressValue = 0;
        RefreshAll();

        try
        {
            await Task.Run(async () => await _installer.RunAsync(OnProgress, _cts.Token));
            _statusKey = "install.done";
            _detailsKey = "details.done";
            ProgressValue = 100;
            _completed = true;
        }
        catch (OperationCanceledException)
        {
            _statusKey = "install.cancelled";
            _detailsKey = "details.cancelled";
            ProgressValue = 0;
            _completed = true;
        }
        catch (Exception ex)
        {
            _statusKey = "install.failed";
            _detailsKey = "details.failure";
            _errorText = ex.Message;
            ProgressValue = 0;
            _completed = true;
        }
        finally
        {
            _isInstalling = false;
            _canCancel = false;
            RefreshAll();
        }
    }

    public void Stop()
    {
        if (_isInstalling && _canCancel)
        {
            _cts?.Cancel();
        }
    }

    public void ScheduleSelfDeleteOnClose()
    {
        if (_completed)
        {
            SetupInstaller.TryScheduleSelfDelete(_setupExePath);
        }
    }

    private void OnProgress(SetupProgressUpdate update)
    {
        Dispatcher.UIThread.Post(() =>
        {
            _statusKey = update.StatusKey;
            _detailsKey = update.DetailsKey;
            _canCancel = update.CanCancel;
            ProgressValue = update.Progress;
            RefreshAll();
        });
    }

    private string T(string key)
    {
        if (_texts.TryGetValue(_language, out var lang) && lang.TryGetValue(key, out var value))
        {
            return value;
        }

        return _texts["en"].TryGetValue(key, out var fallback) ? fallback : key;
    }

    private void RefreshAll()
    {
        OnPropertyChanged(nameof(Title));
        OnPropertyChanged(nameof(Badge));
        OnPropertyChanged(nameof(LanguageLabel));
        OnPropertyChanged(nameof(StatusTitle));
        OnPropertyChanged(nameof(CurrentStepLabel));
        OnPropertyChanged(nameof(DetailsLabel));
        OnPropertyChanged(nameof(StartText));
        OnPropertyChanged(nameof(StopText));
        OnPropertyChanged(nameof(FinishText));
        OnPropertyChanged(nameof(StatusText));
        OnPropertyChanged(nameof(StatusDisplayText));
        OnPropertyChanged(nameof(DetailsText));
        OnPropertyChanged(nameof(DetailsDisplayText));
        OnPropertyChanged(nameof(ProgressValue));
        OnPropertyChanged(nameof(IsProgressAnimated));
        OnPropertyChanged(nameof(CanStart));
        OnPropertyChanged(nameof(CanStop));
        OnPropertyChanged(nameof(CanClose));
        OnPropertyChanged(nameof(IsRussian));
        OnPropertyChanged(nameof(IsEnglish));
        OnPropertyChanged(nameof(RussianBackground));
        OnPropertyChanged(nameof(RussianBorder));
        OnPropertyChanged(nameof(EnglishBackground));
        OnPropertyChanged(nameof(EnglishBorder));
    }

    private void OnPropertyChanged([CallerMemberName] string? propertyName = null)
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
}

internal static class SetupTexts
{
    public static Dictionary<string, Dictionary<string, string>> Build() => new(StringComparer.OrdinalIgnoreCase)
    {
        ["en"] = new(StringComparer.OrdinalIgnoreCase)
        {
            ["badge"] = "SETUP",
            ["title"] = "Install ProtocolBunker and prepare the desktop app for the first launch.",
            ["language.label"] = "Language",
            ["status.title"] = "Setup status",
            ["status.current_step"] = "Current step",
            ["status.details"] = "Details",
            ["actions.start"] = "Start installation",
            ["actions.stop"] = "Stop setup",
            ["actions.close"] = "Close",
            ["actions.finish"] = "Finish",
            ["idle.step"] = "Ready to install.",
            ["details.idle"] = "Choose the interface language first, then press Start installation. The package will be installed into the Protocol-Bunker folder next to this setup file, and the desktop app will launch automatically when setup completes.",
            ["preview.step"] = "Preview mode. Setup flow is not running.",
            ["preview.details"] = "This screen previews the installer UI only. In the real flow you press Start installation, and the package is installed into the Protocol-Bunker folder next to this setup file.",
            ["install.prepare"] = "Preparing installation package...",
            ["details.prepare"] = "The embedded release package is being loaded into a temporary workspace.",
            ["install.unpack"] = "Unpacking desktop package...",
            ["details.unpack"] = "Files are being extracted locally. Setup can still be stopped safely at this stage.",
            ["install.copy"] = "Copying files into the final folder...",
            ["details.copy"] = "The install folder is now being updated. Stop is disabled to avoid leaving a partial setup behind.",
            ["install.launch"] = "Starting the desktop app...",
            ["details.launch"] = "Setup is finishing and the installed ProtocolBunker app is being launched.",
            ["install.finalize"] = "Finalizing setup...",
            ["details.finalize"] = "Temporary files are being removed.",
            ["install.done"] = "Installation complete.",
            ["details.done"] = "ProtocolBunker is installed. You can close setup now or switch back here after the desktop app opens.",
            ["install.cancelled"] = "Installation cancelled.",
            ["details.cancelled"] = "Setup stopped before the final copy stage. Temporary files were cleaned up.",
            ["install.failed"] = "Installation failed.",
            ["details.failure"] = "Setup stopped with an error: {0}",
        },
        ["ru"] = new(StringComparer.OrdinalIgnoreCase)
        {
            ["badge"] = "УСТАНОВКА",
            ["title"] = "Установи ProtocolBunker и подготовь десктопное приложение к первому запуску.",
            ["language.label"] = "Язык",
            ["status.title"] = "Состояние установки",
            ["status.current_step"] = "Текущий этап",
            ["status.details"] = "Подробности",
            ["actions.start"] = "Начать установку",
            ["actions.stop"] = "Остановить установку",
            ["actions.close"] = "Закрыть",
            ["actions.finish"] = "Завершить",
            ["idle.step"] = "Готово к установке.",
            ["details.idle"] = "Сначала выбери язык интерфейса, затем нажми Начать установку. Пакет будет установлен в папку Protocol-Bunker рядом с этим установщиком, а десктопное приложение запустится автоматически после завершения установки.",
            ["preview.step"] = "Режим превью. Установка не запущена.",
            ["preview.details"] = "Этот экран показывает только интерфейс установщика. В реальном сценарии нужно нажать Начать установку, после чего пакет будет установлен в папку Protocol-Bunker рядом с этим установщиком.",
            ["install.prepare"] = "Подготовка установочного пакета...",
            ["details.prepare"] = "Встроенный релизный пакет загружается во временную рабочую папку.",
            ["install.unpack"] = "Распаковка десктопного пакета...",
            ["details.unpack"] = "Файлы извлекаются локально. На этом этапе установку ещё можно безопасно остановить.",
            ["install.copy"] = "Копирование файлов в итоговую папку...",
            ["details.copy"] = "Сейчас обновляется целевая папка установки. Остановка отключена, чтобы не оставить частично установленный набор файлов.",
            ["install.launch"] = "Запуск десктопного приложения...",
            ["details.launch"] = "Установка завершается, после чего будет запущено установленное приложение ProtocolBunker.",
            ["install.finalize"] = "Финализация установки...",
            ["details.finalize"] = "Временные файлы удаляются.",
            ["install.done"] = "Установка завершена.",
            ["details.done"] = "ProtocolBunker установлен. Теперь можно закрыть установщик или вернуться сюда после открытия десктопного приложения.",
            ["install.cancelled"] = "Установка остановлена.",
            ["details.cancelled"] = "Установка была остановлена до финального копирования. Временные файлы очищены.",
            ["install.failed"] = "Установка завершилась ошибкой.",
            ["details.failure"] = "Установщик остановился с ошибкой: {0}",
        },
    };
}
