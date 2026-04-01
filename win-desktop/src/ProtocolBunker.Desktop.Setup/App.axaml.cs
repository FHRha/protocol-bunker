using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using ProtocolBunker.Desktop.Setup.Services;

namespace ProtocolBunker.Desktop.Setup;

public partial class App : Application
{
    public override void Initialize()
    {
        AvaloniaXamlLoader.Load(this);
    }

    public override void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            desktop.MainWindow = new MainWindow
            {
                DataContext = new SetupShell(new SetupInstaller(), desktop.Args ?? Array.Empty<string>()),
            };
        }

        base.OnFrameworkInitializationCompleted();
    }
}
