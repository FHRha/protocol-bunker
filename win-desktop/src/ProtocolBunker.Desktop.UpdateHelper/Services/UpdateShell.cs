using System.ComponentModel;
using System.Runtime.CompilerServices;
using Avalonia.Media;
using Avalonia.Threading;

namespace ProtocolBunker.Desktop.UpdateHelper.Services;

internal sealed class UpdateShell : INotifyPropertyChanged
{
    private readonly UpdateInstaller _installer;
    private readonly UpdateArgs _args;
    private readonly DispatcherTimer _asciiTimer;
    private readonly IReadOnlyList<string> _frames;
    private readonly Dictionary<string, Dictionary<string, string>> _texts;
    private int _frameIndex;
    private int _ellipsisPhase;
    private CancellationTokenSource? _cts;
    private bool _isRunning;
    private bool _canCancel;
    private bool _canClose;
    private string _language;
    private string _statusKey;
    private string _detailsKey;
    private string? _errorText;

    public event PropertyChangedEventHandler? PropertyChanged;

    public UpdateShell(UpdateInstaller installer, string[] args)
    {
        _installer = installer;
        _args = UpdateInstaller.ParseArgs(args);
        _texts = UpdateTexts.Build();
        _language = System.Globalization.CultureInfo.CurrentUICulture.TwoLetterISOLanguageName.Equals("ru", StringComparison.OrdinalIgnoreCase) ? "ru" : "en";
        _statusKey = _args.PreviewUi ? "preview.step" : "update.wait";
        _detailsKey = _args.PreviewUi ? "preview.details" : "details.wait";
        _frames = UpdateInstaller.LoadPlanetFrames();
        _asciiTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(140) };
        _asciiTimer.Tick += (_, _) =>
        {
            if (_frames.Count != 0)
            {
                _frameIndex = (_frameIndex + 1) % _frames.Count;
                OnPropertyChanged(nameof(AsciiFrame));
            }

            if (_isRunning)
            {
                _ellipsisPhase = (_ellipsisPhase + 1) % 4;
                OnPropertyChanged(nameof(StatusDisplayText));
                OnPropertyChanged(nameof(DetailsDisplayText));
            }
        };
        _asciiTimer.Start();

        ProgressValue = _args.PreviewUi ? 18 : 6;
        _canClose = _args.PreviewUi;

        if (!_args.PreviewUi)
        {
            StartRun();
        }
    }

    public string Badge => T("badge");
    public string Title => T("title");
    public string StatusTitle => T("status.title");
    public string CurrentStepLabel => T("status.current_step");
    public string DetailsLabel => T("status.details");
    public string CancelText => T("actions.cancel");
    public string CloseText => T("actions.close");
    public string StatusText => T(_statusKey);
    public string DetailsText => _errorText is null ? T(_detailsKey) : string.Format(T(_detailsKey), _errorText);
    public string StatusDisplayText => _isRunning ? $"{StatusText}{new string('.', _ellipsisPhase)}" : StatusText;
    public string DetailsDisplayText => _isRunning ? $"{DetailsText}{new string('.', _ellipsisPhase)}" : DetailsText;
    public string AsciiFrame => _frames.Count == 0 ? string.Empty : _frames[_frameIndex];
    public int ProgressValue { get; private set; }
    public bool IsProgressAnimated => _args.PreviewUi && !_isRunning;
    public bool CanCancel => _isRunning && _canCancel;
    public bool CanClose => _canClose;
    public IBrush StatusBrush => _statusKey switch
    {
        "update.done" => AccentStrong,
        "update.failed" => Error,
        "update.cancelled" => Warning,
        _ => Accent,
    };

    private static SolidColorBrush Accent => new(Color.Parse("#D39B43"));
    private static SolidColorBrush AccentStrong => new(Color.Parse("#F0AE4F"));
    private static SolidColorBrush Warning => new(Color.Parse("#D39B43"));
    private static SolidColorBrush Error => new(Color.Parse("#D36A43"));

    public void Cancel()
    {
        if (_isRunning && _canCancel)
        {
            _cts?.Cancel();
        }
    }

    private void StartRun()
    {
        _cts = new CancellationTokenSource();
        _isRunning = true;
        _canCancel = true;
        _canClose = false;
        _ellipsisPhase = 0;
        RefreshAll();

        _ = RunUpdateAsync(_cts.Token);
    }

    private async Task RunUpdateAsync(CancellationToken token)
    {
        try
        {
            await _installer.RunAsync(_args, OnProgress, token);
            if (_args.PreviewUi)
            {
                return;
            }

            _statusKey = "update.done";
            _detailsKey = "details.done";
            ProgressValue = 100;
        }
        catch (OperationCanceledException)
        {
            _statusKey = "update.cancelled";
            _detailsKey = "details.cancelled";
            ProgressValue = 0;
        }
        catch (Exception ex)
        {
            _statusKey = "update.failed";
            _detailsKey = "details.failed";
            _errorText = ex.Message;
            ProgressValue = 0;
        }
        finally
        {
            _isRunning = false;
            _canCancel = false;
            _canClose = true;
            RefreshAll();
        }
    }

    private void OnProgress(UpdateProgressUpdate update)
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
        OnPropertyChanged(nameof(Badge));
        OnPropertyChanged(nameof(Title));
        OnPropertyChanged(nameof(StatusTitle));
        OnPropertyChanged(nameof(CurrentStepLabel));
        OnPropertyChanged(nameof(DetailsLabel));
        OnPropertyChanged(nameof(CancelText));
        OnPropertyChanged(nameof(CloseText));
        OnPropertyChanged(nameof(StatusText));
        OnPropertyChanged(nameof(DetailsText));
        OnPropertyChanged(nameof(StatusDisplayText));
        OnPropertyChanged(nameof(DetailsDisplayText));
        OnPropertyChanged(nameof(ProgressValue));
        OnPropertyChanged(nameof(IsProgressAnimated));
        OnPropertyChanged(nameof(CanCancel));
        OnPropertyChanged(nameof(CanClose));
        OnPropertyChanged(nameof(StatusBrush));
    }

    private void OnPropertyChanged([CallerMemberName] string? propertyName = null)
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
}

internal static class UpdateTexts
{
    public static Dictionary<string, Dictionary<string, string>> Build() => new(StringComparer.OrdinalIgnoreCase)
    {
        ["en"] = new(StringComparer.OrdinalIgnoreCase)
        {
            ["badge"] = "UPDATE",
            ["title"] = "Apply the packaged ProtocolBunker update and relaunch the desktop app.",
            ["status.title"] = "Update status",
            ["status.current_step"] = "Current step",
            ["status.details"] = "Details",
            ["actions.cancel"] = "Cancel update",
            ["actions.close"] = "Close",
            ["preview.step"] = "Preview mode. Update flow is not running.",
            ["preview.details"] = "This screen previews the updater UI only. In the real flow the installed app is closed, files are replaced, and the desktop app is started again.",
            ["update.wait"] = "Waiting for the desktop app to close",
            ["details.wait"] = "The updater is waiting for the running ProtocolBunker process to exit before replacing files.",
            ["update.unpack"] = "Unpacking update package",
            ["details.unpack"] = "The downloaded update archive is being extracted into a temporary workspace.",
            ["update.copy"] = "Replacing installed files",
            ["details.copy"] = "Updated files are being copied into the install folder. User data, logs, and portable settings are preserved.",
            ["update.launch"] = "Starting the desktop app",
            ["details.launch"] = "The update has been copied and the refreshed ProtocolBunker app is being launched.",
            ["update.done"] = "Update complete",
            ["details.done"] = "The update finished successfully. The desktop app should already be opening.",
            ["update.cancelled"] = "Update cancelled",
            ["details.cancelled"] = "The update was cancelled before the file replacement stage.",
            ["update.failed"] = "Update failed",
            ["details.failed"] = "The updater stopped with an error: {0}",
        },
        ["ru"] = new(StringComparer.OrdinalIgnoreCase)
        {
            ["badge"] = "ОБНОВЛЕНИЕ",
            ["title"] = "Примени пакетное обновление ProtocolBunker и заново запусти десктопное приложение.",
            ["status.title"] = "Состояние обновления",
            ["status.current_step"] = "Текущий этап",
            ["status.details"] = "Подробности",
            ["actions.cancel"] = "Отменить обновление",
            ["actions.close"] = "Закрыть",
            ["preview.step"] = "Режим превью. Обновление не запущено.",
            ["preview.details"] = "Этот экран показывает только интерфейс обновлятора. В реальном сценарии приложение закрывается, файлы заменяются, а затем ProtocolBunker запускается снова.",
            ["update.wait"] = "Ожидание закрытия десктопного приложения",
            ["details.wait"] = "Обновлятор ждёт завершения работающего процесса ProtocolBunker перед заменой файлов.",
            ["update.unpack"] = "Распаковка пакета обновления",
            ["details.unpack"] = "Скачанный архив обновления извлекается во временную рабочую папку.",
            ["update.copy"] = "Замена установленных файлов",
            ["details.copy"] = "Новые файлы копируются в папку установки. Пользовательские данные, логи и portable-настройки сохраняются.",
            ["update.launch"] = "Запуск десктопного приложения",
            ["details.launch"] = "Обновление скопировано, после чего будет заново запущено обновлённое приложение ProtocolBunker.",
            ["update.done"] = "Обновление завершено",
            ["details.done"] = "Обновление успешно применено. Десктопное приложение уже должно открываться.",
            ["update.cancelled"] = "Обновление остановлено",
            ["details.cancelled"] = "Обновление было остановлено до этапа замены файлов.",
            ["update.failed"] = "Обновление завершилось ошибкой",
            ["details.failed"] = "Обновлятор остановился с ошибкой: {0}",
        },
    };
}
