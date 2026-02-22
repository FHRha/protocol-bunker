using System.IO;
using System.Net.Sockets;
using System.Text;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Threading;
using MessageBox = System.Windows.MessageBox;

namespace ProtocolBunker.Launcher;

public partial class App : System.Windows.Application
{
    private static bool _fatalShown;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        DispatcherUnhandledException += OnDispatcherUnhandledException;
        AppDomain.CurrentDomain.UnhandledException += OnDomainUnhandledException;
        TaskScheduler.UnobservedTaskException += OnUnobservedTaskException;

        try
        {
            var window = new MainWindow();
            MainWindow = window;
            window.Show();
        }
        catch (Exception ex)
        {
            ShowFatalAndExit("Ошибка запуска лаунчера", ex);
        }
    }

    private void OnDispatcherUnhandledException(object sender, DispatcherUnhandledExceptionEventArgs e)
    {
        e.Handled = true;
        ShowFatalAndExit("Необработанная ошибка интерфейса", e.Exception);
    }

    private void OnDomainUnhandledException(object? sender, UnhandledExceptionEventArgs e)
    {
        var ex = e.ExceptionObject as Exception ?? new Exception("Unknown fatal exception.");
        ShowFatalAndExit("Критическая ошибка процесса", ex);
    }

    private void OnUnobservedTaskException(object? sender, UnobservedTaskExceptionEventArgs e)
    {
        e.SetObserved();
        if (IsIgnorableBackgroundException(e.Exception))
        {
            WriteCrashLog("Игнорируемая ошибка фоновой задачи", e.Exception);
            return;
        }

        ShowFatalAndExit("Критическая ошибка фоновой задачи", e.Exception);
    }

    private static bool IsIgnorableBackgroundException(Exception ex)
    {
        IEnumerable<Exception> toCheck = ex is AggregateException aggregate
            ? aggregate.Flatten().InnerExceptions
            : new[] { ex };

        foreach (var item in toCheck)
        {
            if (item is OperationCanceledException or TaskCanceledException)
            {
                continue;
            }

            if (item is SocketException socketEx && socketEx.SocketErrorCode == SocketError.OperationAborted)
            {
                continue;
            }

            if (item is IOException ioEx &&
                ioEx.InnerException is SocketException innerSocket &&
                innerSocket.SocketErrorCode == SocketError.OperationAborted)
            {
                continue;
            }

            return false;
        }

        return true;
    }

    private static void ShowFatalAndExit(string title, Exception ex)
    {
        if (_fatalShown) return;
        _fatalShown = true;

        var logPath = WriteCrashLog(title, ex);
        MessageBox.Show(
            $"{title}\n\n{ex.Message}\n\nЛог: {logPath}",
            "Protocol: Bunker Launcher",
            MessageBoxButton.OK,
            MessageBoxImage.Error);

        Current?.Shutdown(1);
    }

    private static string WriteCrashLog(string title, Exception ex)
    {
        var baseDir = AppContext.BaseDirectory;
        var logPath = Path.Combine(baseDir, "launcher-crash.log");
        var sb = new StringBuilder();
        sb.AppendLine($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {title}");
        sb.AppendLine(ex.ToString());
        sb.AppendLine();
        try
        {
            File.AppendAllText(logPath, sb.ToString(), Encoding.UTF8);
        }
        catch
        {
            // best effort
        }
        return logPath;
    }
}
