using ProtocolBunker.Desktop.Application.Commands;
using ProtocolBunker.Desktop.Application.ViewModels;
using ProtocolBunker.Desktop.Contracts.Models;
using Xunit;

namespace ProtocolBunker.Desktop.Tests;

public sealed class MainWindowViewModelSettingsTests
{
    [Fact]
    public async Task SaveSettings_ShowsValidationError_WhenPortIsInvalid()
    {
        var runtime = new FakeRuntimeService();
        var settings = new FakeDesktopSettingsService();
        var viewModel = CreateViewModel(runtime, settings, new FakeRoomLinkService());
        await viewModel.InitializeAsync();

        viewModel.Network.EditablePort = "70000";

        await ExecuteAsync(viewModel.SaveSettingsCommand);

        Assert.Equal("Некорректный порт.", viewModel.Network.SettingsStatus);
        Assert.Equal(8080, settings.Current.Port);
    }

    [Fact]
    public async Task SaveSettings_ShowsValidationError_WhenDomainModeHasNoDomain()
    {
        var runtime = new FakeRuntimeService();
        var settings = new FakeDesktopSettingsService();
        var viewModel = CreateViewModel(runtime, settings, new FakeRoomLinkService());
        await viewModel.InitializeAsync();

        viewModel.Network.EditableMode = "domain";
        viewModel.Network.EditableDomain = string.Empty;

        await ExecuteAsync(viewModel.SaveSettingsCommand);

        Assert.Equal("Нужен домен.", viewModel.Network.SettingsStatus);
        Assert.Equal("local", settings.Current.Mode);
    }

    [Fact]
    public async Task SaveSettings_ShowsValidationError_WhenLocalhostIsUsedOutsideDeveloperMode()
    {
        var runtime = new FakeRuntimeService();
        var settings = new FakeDesktopSettingsService();
        var viewModel = CreateViewModel(runtime, settings, new FakeRoomLinkService());
        await viewModel.InitializeAsync();

        viewModel.Network.EditablePublicHost = "localhost";
        viewModel.Network.EditableDeveloperMode = false;

        await ExecuteAsync(viewModel.SaveSettingsCommand);

        Assert.Equal("localhost разрешён только в dev mode.", viewModel.Network.SettingsStatus);
        Assert.Equal(string.Empty, settings.Current.PublicHost);
    }

    [Fact]
    public async Task EditingNetworkSettings_RecomputesPreviewInHomeAndAccess()
    {
        var runtime = new FakeRuntimeService
        {
            SnapshotFactory = settings => new HomeStatusSnapshot(
                Version: "v0.2.8",
                RuntimeState: RuntimeState.Stopped,
                ActiveMode: settings?.Mode ?? "local",
                Port: settings?.Port ?? 8080,
                RoomCode: settings?.RoomCode ?? "ABCD",
                ReachabilitySummary: $"preview:{settings?.Port}",
                RuntimeSource: "source",
                InstallRoot: "install",
                AppRoot: "app",
                DataRoot: settings?.DataFolder ?? "app/data",
                ProcessId: null,
                StatusDetail: "detail")
        };

        var links = new FakeRoomLinkService
        {
            SnapshotFactory = settings => new RoomLinksSnapshot(
                RoomCode: settings?.RoomCode ?? "ABCD",
                InternalBaseUrl: $"http://127.0.0.1:{settings?.Port ?? 8080}",
                ExternalBaseUrl: $"http://example.test:{settings?.Port ?? 8080}",
                PlayerUrlInternal: null,
                PlayerUrlExternal: null,
                OverlayUrlInternal: $"http://127.0.0.1:{settings?.Port ?? 8080}/overlay",
                OverlayUrlExternal: $"http://example.test:{settings?.Port ?? 8080}/overlay",
                ControlInviteUrlInternal: null,
                ControlInviteUrlExternal: null,
                StatusMessage: "ok")
        };

        var viewModel = CreateViewModel(runtime, new FakeDesktopSettingsService(), links);
        await viewModel.InitializeAsync();

        viewModel.Network.EditablePort = "9090";

        for (var i = 0; i < 20 && viewModel.Access.InternalBaseUrl != "http://127.0.0.1:9090"; i++)
        {
            await Task.Delay(50);
        }

        Assert.Equal("9090", viewModel.Home.Port);
        Assert.Equal("http://127.0.0.1:9090", viewModel.Access.InternalBaseUrl);
        Assert.Equal("http://example.test:9090", viewModel.Access.ExternalBaseUrl);
        Assert.Equal("preview:9090", viewModel.Home.Reachability);
    }

    private static MainWindowViewModel CreateViewModel(
        FakeRuntimeService runtime,
        FakeDesktopSettingsService settings,
        FakeRoomLinkService links)
    {
        return new MainWindowViewModel(
            runtime,
            settings,
            links,
            new FakePlatformShellService(),
            new FakeUpdateService(),
            new FakeLocalizationService());
    }

    private static async Task ExecuteAsync(System.Windows.Input.ICommand command)
    {
        var asyncCommand = Assert.IsType<AsyncCommand>(command);
        asyncCommand.Execute(null);

        for (var i = 0; i < 20 && !asyncCommand.CanExecute(null); i++)
        {
            await Task.Delay(25);
        }
    }
}
