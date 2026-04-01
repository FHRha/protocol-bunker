using ProtocolBunker.Desktop.Application.ViewModels;
using ProtocolBunker.Desktop.Contracts.Models;
using Xunit;

namespace ProtocolBunker.Desktop.Tests;

public sealed class MainWindowViewModelTests
{
    [Fact]
    public async Task InitializeAsync_MapsRunningStateToLocalizedRunningLabel()
    {
        var runtime = new FakeRuntimeService
        {
            CurrentSnapshot = new HomeStatusSnapshot(
                Version: "v0.2.8",
                RuntimeState: RuntimeState.Running,
                ActiveMode: "local",
                Port: 8080,
                RoomCode: "ABCD",
                ReachabilitySummary: "reachability",
                RuntimeSource: "source",
                InstallRoot: "install",
                AppRoot: "app",
                DataRoot: "app/data",
                ProcessId: 123,
                StatusDetail: "detail")
        };

        var viewModel = CreateViewModel(runtime);
        await viewModel.InitializeAsync();

        Assert.Equal("Запущен", viewModel.Home.RuntimeState);
    }

    [Fact]
    public async Task RuntimeStateChanged_RefreshesHomeFromStartingToRunning()
    {
        var runtime = new FakeRuntimeService
        {
            CurrentSnapshot = new HomeStatusSnapshot(
                Version: "v0.2.8",
                RuntimeState: RuntimeState.Starting,
                ActiveMode: "local",
                Port: 8080,
                RoomCode: "ABCD",
                ReachabilitySummary: "reachability",
                RuntimeSource: "source",
                InstallRoot: "install",
                AppRoot: "app",
                DataRoot: "app/data",
                ProcessId: 123,
                StatusDetail: "Запуск сервера...")
        };

        var viewModel = CreateViewModel(runtime);
        await viewModel.InitializeAsync();

        Assert.Equal("Запускается", viewModel.Home.RuntimeState);

        runtime.CurrentSnapshot = runtime.CurrentSnapshot with
        {
            RuntimeState = RuntimeState.Running,
            StatusDetail = "Сервер слушает порт 8080."
        };

        runtime.RaiseStateChanged();

        for (var i = 0; i < 20 && viewModel.Home.RuntimeState != "Запущен"; i++)
        {
            await Task.Delay(50);
        }

        Assert.Equal("Запущен", viewModel.Home.RuntimeState);
        Assert.Equal("Сервер слушает порт 8080.", viewModel.Home.StatusDetail);
    }

    [Fact]
    public async Task InitializeAsync_MapsStoppingStateToLocalizedStoppingLabel()
    {
        var runtime = new FakeRuntimeService
        {
            CurrentSnapshot = new HomeStatusSnapshot(
                Version: "v0.2.8",
                RuntimeState: RuntimeState.Stopping,
                ActiveMode: "local",
                Port: 8080,
                RoomCode: "ABCD",
                ReachabilitySummary: "reachability",
                RuntimeSource: "source",
                InstallRoot: "install",
                AppRoot: "app",
                DataRoot: "app/data",
                ProcessId: 123,
                StatusDetail: "Остановка сервера...")
        };

        var viewModel = CreateViewModel(runtime);
        await viewModel.InitializeAsync();

        Assert.Equal("Останавливается", viewModel.Home.RuntimeState);
    }

    private static MainWindowViewModel CreateViewModel(FakeRuntimeService runtime)
    {
        return new MainWindowViewModel(
            runtime,
            new FakeDesktopSettingsService(),
            new FakeRoomLinkService(),
            new FakePlatformShellService(),
            new FakeUpdateService(),
            new FakeLocalizationService());
    }
}
