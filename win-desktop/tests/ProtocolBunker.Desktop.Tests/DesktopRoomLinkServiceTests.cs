using System.Net;
using System.Net.Sockets;
using System.Text;
using ProtocolBunker.Desktop.Contracts.Models;
using ProtocolBunker.Desktop.Infrastructure.Services;
using Xunit;

namespace ProtocolBunker.Desktop.Tests;

public sealed class DesktopRoomLinkServiceTests
{
    [Fact]
    public async Task BuildAsync_ReturnsRuntimeNotRunning_WhenServerIsStopped()
    {
        var service = CreateService(
            new FakeRuntimeService
            {
                CurrentSnapshot = new HomeStatusSnapshot(
                    "v0.2.8",
                    RuntimeState.Stopped,
                    "local",
                    8080,
                    "ABCD",
                    "reachability",
                    "source",
                    "install",
                    "app",
                    "app/data",
                    null,
                    "detail")
            },
            new FakeDesktopSettingsService());

        var result = await service.BuildAsync();

        Assert.Equal("Сервер не запущен.", result.StatusMessage);
        Assert.Null(result.PlayerUrlInternal);
        Assert.Null(result.OverlayUrlInternal);
    }

    [Fact]
    public async Task BuildAsync_ReturnsRoomEmpty_WhenServerIsRunningWithoutRoomCode()
    {
        const int port = 38991;
        var service = CreateService(
            new FakeRuntimeService
            {
                CurrentSnapshot = new HomeStatusSnapshot(
                    "v0.2.8",
                    RuntimeState.Running,
                    "local",
                    port,
                    string.Empty,
                    "reachability",
                    "source",
                    "install",
                    "app",
                    "app/data",
                    123,
                    "detail")
            },
            new FakeDesktopSettingsService
            {
                Current = new DesktopSettingsModel("ru", "local", port, string.Empty, string.Empty, "app/data", string.Empty, string.Empty, "gpt-4o-mini", 45000, string.Empty, false, string.Empty, string.Empty, string.Empty)
            });

        var result = await service.BuildAsync();

        Assert.Equal("Код комнаты пустой.", result.StatusMessage);
        Assert.False(string.IsNullOrWhiteSpace(result.InternalBaseUrl));
        Assert.EndsWith($":{port}", result.InternalBaseUrl);
        Assert.Null(result.PlayerUrlInternal);
    }

    [Fact]
    public async Task BuildAsync_UsesConfiguredExternalBaseWithoutCallingPublicIpProviders()
    {
        var service = CreateService(
            new FakeRuntimeService
            {
                CurrentSnapshot = new HomeStatusSnapshot(
                    "v0.2.8",
                    RuntimeState.Running,
                    "local",
                    38992,
                    "ABCD",
                    "reachability",
                    "source",
                    "install",
                    "app",
                    "app/data",
                    123,
                    "detail")
            },
            new FakeDesktopSettingsService
            {
                Current = new DesktopSettingsModel("ru", "local", 38992, "example.test", string.Empty, "app/data", string.Empty, string.Empty, "gpt-4o-mini", 45000, "ABCD", false, string.Empty, string.Empty, string.Empty)
            });

        var result = await service.BuildAsync();

        Assert.Equal("http://example.test:38992", result.ExternalBaseUrl);
    }

    [Fact]
    public async Task BuildAsync_RebasesUrls_FromDesktopApiPayload()
    {
        var port = GetFreeTcpPort();
        var server = StartDesktopApiStub(port, async context =>
        {
            var path = context.Request.Url!.AbsolutePath;
            context.Response.ContentType = "application/json";

            if (path == "/api/desktop/endpoints")
            {
                await WriteJsonAsync(context.Response, $"{{\"ok\":true,\"base\":{{\"public\":\"http://public.example:{port}\"}}}}");
                return;
            }

            if (path == "/api/desktop/access")
            {
                await WriteJsonAsync(
                    context.Response,
                    "{" +
                    "\"ok\":true," +
                    "\"roomCode\":\"ABCD\"," +
                    "\"links\":{" +
                    $"\"appUrl\":{{\"lan\":\"http://10.0.0.5:{port}/?room=ABCD\",\"public\":\"http://public.example:{port}/?room=ABCD\"}}," +
                    $"\"overlayViewUrl\":{{\"lan\":\"http://10.0.0.5:{port}/overlay?room=ABCD\",\"public\":\"http://public.example:{port}/overlay?room=ABCD\"}}," +
                    $"\"overlayControlUrl\":{{\"lan\":\"http://10.0.0.5:{port}/overlay-control?room=ABCD\",\"public\":\"http://public.example:{port}/overlay-control?room=ABCD\"}}" +
                    "}" +
                    "}");
                return;
            }

            context.Response.StatusCode = 404;
            context.Response.Close();
        });
        using var listener = server.Listener;

        var service = CreateService(
            new FakeRuntimeService
            {
                CurrentSnapshot = new HomeStatusSnapshot(
                    "v0.2.8",
                    RuntimeState.Running,
                    "local",
                    port,
                    "ABCD",
                    "reachability",
                    "source",
                    "install",
                    "app",
                    "app/data",
                    123,
                    "detail")
            },
            new FakeDesktopSettingsService
            {
                Current = new DesktopSettingsModel("ru", "local", port, "public.example", string.Empty, "app/data", string.Empty, string.Empty, "gpt-4o-mini", 45000, "ABCD", true, string.Empty, string.Empty, string.Empty)
            });

        var result = await service.BuildAsync();

        Assert.Equal($"http://localhost:{port}", result.InternalBaseUrl);
        Assert.Equal($"http://public.example:{port}", result.ExternalBaseUrl);
        Assert.Equal($"http://localhost:{port}/?room=ABCD", result.PlayerUrlInternal);
        Assert.Equal($"http://public.example:{port}/?room=ABCD", result.PlayerUrlExternal);
        Assert.Equal($"http://localhost:{port}/overlay?room=ABCD", result.OverlayUrlInternal);
        Assert.Equal($"http://public.example:{port}/overlay?room=ABCD", result.OverlayUrlExternal);
        Assert.Equal($"http://localhost:{port}/overlay-control?room=ABCD", result.ControlInviteUrlInternal);
        Assert.Equal($"http://public.example:{port}/overlay-control?room=ABCD", result.ControlInviteUrlExternal);
        Assert.Equal("Доступны внутренний и внешний адреса.", result.StatusMessage);

        listener.Stop();
        await server.LoopTask;
    }

    [Fact]
    public async Task CreateControlInviteAsync_ReturnsRoomRequired_WhenRoomCodeIsMissing()
    {
        var service = CreateService(
            new FakeRuntimeService
            {
                CurrentSnapshot = new HomeStatusSnapshot(
                    "v0.2.8",
                    RuntimeState.Running,
                    "local",
                    38994,
                    string.Empty,
                    "reachability",
                    "source",
                    "install",
                    "app",
                    "app/data",
                    123,
                    "detail")
            },
            new FakeDesktopSettingsService
            {
                Current = new DesktopSettingsModel("ru", "local", 38994, string.Empty, string.Empty, "app/data", string.Empty, string.Empty, "gpt-4o-mini", 45000, string.Empty, false, string.Empty, string.Empty, string.Empty)
            });

        var result = await service.CreateControlInviteAsync();

        Assert.False(result.Success);
        Assert.Equal("Нужен код комнаты.", result.Message);
    }

    private static DesktopRoomLinkService CreateService(FakeRuntimeService runtime, FakeDesktopSettingsService settings)
    {
        return new DesktopRoomLinkService(
            settings,
            runtime,
            new FakeLocalizationService(),
            new DesktopApiSessionService());
    }

    private static (HttpListener Listener, Task LoopTask) StartDesktopApiStub(int port, Func<HttpListenerContext, Task> handler)
    {
        var listener = new HttpListener();
        listener.Prefixes.Add($"http://127.0.0.1:{port}/");
        listener.Start();

        var loop = Task.Run(async () =>
        {
            while (listener.IsListening)
            {
                try
                {
                    var context = await listener.GetContextAsync();
                    await handler(context);
                }
                catch (HttpListenerException)
                {
                    break;
                }
                catch (ObjectDisposedException)
                {
                    break;
                }
            }
        });

        return (listener, loop);
    }

    private static int GetFreeTcpPort()
    {
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        return port;
    }

    private static async Task WriteJsonAsync(HttpListenerResponse response, string json)
    {
        var bytes = Encoding.UTF8.GetBytes(json);
        response.StatusCode = 200;
        response.ContentLength64 = bytes.Length;
        await response.OutputStream.WriteAsync(bytes);
        response.Close();
    }
}
