using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using ProtocolBunker.Desktop.Application.ViewModels;
using ProtocolBunker.Desktop.App.Services;
using ProtocolBunker.Desktop.Infrastructure.Services;

namespace ProtocolBunker.Desktop.App;

public partial class App : Avalonia.Application
{
    private AsciiAnimationController? _asciiAnimationController;

    public override void Initialize()
    {
        AvaloniaXamlLoader.Load(this);
    }

    public override void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            MainWindow? mainWindow = null;
            var settingsService = new FileDesktopSettingsService();
            var localizationService = new DesktopLocalizationService();
            var desktopApiSession = new DesktopApiSessionService();
            var runtimeService = new DesktopRuntimeService(settingsService, localizationService, desktopApiSession);
            AppDomain.CurrentDomain.ProcessExit += (_, _) =>
            {
                try
                {
                    runtimeService.StopAsync().GetAwaiter().GetResult();
                }
                catch
                {
                    // ignored during process teardown
                }
            };
            var platformShellService = new AvaloniaPlatformShellService(() => mainWindow);
            var viewModel = new MainWindowViewModel(
                runtimeService,
                settingsService,
                new DesktopRoomLinkService(settingsService, runtimeService, localizationService, desktopApiSession),
                platformShellService,
                new DesktopUpdateService(runtimeService, platformShellService, localizationService),
                new DesktopAiAccessKeyService(),
                localizationService);
            mainWindow = new MainWindow
            {
                DataContext = viewModel,
            };
            desktop.MainWindow = mainWindow;

            _asciiAnimationController = new AsciiAnimationController(viewModel.Home);
            _asciiAnimationController.Start();
            _ = viewModel.InitializeAsync();
        }

        base.OnFrameworkInitializationCompleted();
    }
}
